/**
 * This endpoint listens for incoming connections. It must map incoming
 * connections to existing endpoints, if so available. This mapping must also
 * key the transport implementation to send future reconnects to the same
 * endpoint, if still available
 * 
 * @author Vladimir Katardjiev
 * @constructor
 */
Trap.ListenerEndpoint = function() {
//public class ListenerTrapEndpoint extends TrapEndpointImpl implements ListenerTrapTransportDelegate, TrapListener
	
	Trap.Endpoint.prototype.constructor.call(this);
	// currently live spawned endpoints
	// Type <String, WeakReference<ServerTrapEndpoint>>
	this.endpoints					= new Trap.Map();
	// newly born transports
	// Type <TrapTransport>
	this.sTransports				= new Trap.List();
	this.sDelegate					= null;
	this.sContext					= null;
	
	/*
	 * It is possible for an endpoint to attempt to multi-connect transports (i.e. connect multiple transports simultaneously).
	 * With no further coordination, these transports would spawn separate endpoints on the server end. But the server cannot
	 * coordinate them as the client doesn't know which will first-succeed.
	 *
	 * The solution is simple; each client will generate a unique identifier to map transports from the same client together.
	 * This identifier must be long, include a client-specific part, a temporal part and a random part, and is only valid for 30 seconds.
	 * There is a risk that if someone guesses this identifier during the 30-second window, he or she can attach to a Trap session
	 * without permission (if the session is unauthenticated), but the risk of guessing such a short-lived and high-entropy passphrase is
	 * minimal.
	 *
	 * After 30 seconds, this timer expires. The timer is configurable via the configuration parameter trap.concurrent-connection-window
	 */
	
	this.concurrentConnectionWindow	= 30000;
	
	// Type <String, ServerTrapEndpoint>
	this.ccEndpoints				= new Trap.Map();
	

	// Load the appropriate transports
	for (var tName in Trap.Transports)
	{
		var t = Trap.Transports[tName];

		if (t.prototype && typeof(t.prototype.setTransportPriority) == "function" ) // is a transport 
		{
			var transport = new t();
			this.logger.trace("Initialising new Transport for server: {}", transport.getTransportName());

			if (!transport.canListen())
			{
				this.logger.trace("Skipping it; it cannot listen");
				continue;
			}
			
			if (this.useBinary && !transport.supportsBinary)
			{
				this.logger.info("Skipping it; Trap Binary Mode requested, but transport only supports text");
				continue;
			}
			
			transport.useBinary = this.useBinary;
			
			// Unlike Java, TrapEndpoint only defines one addTransport, and that one sets
			// this object as delegate. Thus, we're done.
			this.addTransport(transport);
		}
	}
	
	if (this.transports.size() == 0)
		throw "No transports could be initialised; either no transports could connect, or transports did not support binary mode (if requested)";

	
};

Trap.ListenerEndpoint.prototype = new Trap.Endpoint;
Trap.ListenerEndpoint.prototype.constructor = Trap.ListenerEndpoint;
																												
/**
 * Called when the state of this listener's transport is changed.
 * @param {Trap.Transport.State} newState
 * @param {Trap.Transport.State} oldState
 * @param {Trap.Transport} transport
 * @param {Object} context
 * @return null
 */
Trap.ListenerEndpoint.prototype.ttStateChanged = function(newState, oldState, transport, context)
	{
		if ((newState == Trap.Transport.State.DISCONNECTED) || (newState == Trap.Transport.State.ERROR))
			this.sTransports.remove(transport);
	};
	
	/**
 * @param {Trap.Message} message
 * @param {Trap.Transport} transport
 * @param {Object} context
 * @return null
 */
Trap.ListenerEndpoint.prototype.ttMessageReceived = function(message, transport, context)
{
	if (message.getOp() != Trap.Message.Operation.OPEN)
	{
		try
		{
			transport.send(new Trap.Message().setOp(Trap.Message.Operation.ERROR), false);
		}
		catch (e)
		{
		}
		transport.disconnect();
		this.logger.info("Disconnecting transport with ID [{}] due to the first message operation not being open; it was [{}]", transport, message.getOp());
		return;
	}
	
	this.logger.debug("New OPEN message. Body length is {}", (message.getData() != null ? message.getData().length : 0));
	
	// Parse body. We'll need some of the information here...
	
	var cfg = new Trap.Configuration(message.getDataAsString());
	var trapId = cfg.getOption(Trap.Constants.ENDPOINT_ID);
	
	if (trapId != Trap.Constants.ENDPOINT_ID_CLIENT)
	{
		var e = this.endpoints.get(trapId);
		
		if (e == null)
		{
			try
			{
				transport.send(new Trap.Message().setOp(Trap.Message.Operation.ERROR), false);
			}
			catch (e1)
			{
			}
			transport.disconnect();
			this.logger.info("Disconnecting transport with ID [{}] due to it trying to connect to non-existent TrapEndpoint session; id [{}]", transport, trapId);
			return;
		}
		
		this.logger.debug("Adding new transport to TrapEndpoint ID {}", e.getTrapID());
		e.addTransport(transport, message);
		
	}
	else
	{
		try
		{
			
			
			var token = cfg.getOption(Trap.Constants.CONNECTION_TOKEN);
			
			var e = this.ccEndpoints.get(token);
			
			if (e == null)
			{
				this.logger.debug("Creating new TrapEndpoint in response to new transport");
				e = new Trap.ServerEndpoint(this);
				
				// Propagate all settings to the new endpoint
				e.configure(this.getConfiguration());
				e.setAuthentication(this.getAuthentication());
				e.setQueueType(this.getQueueType());
				e.setTrapID(Trap._uuid());
				e.setFormat(message.getFormat());
				
				// Store it for future connections
				this.endpoints.put(e.getTrapID(), e);
				
				// Attach transport to endpoint, continuing auth
				e.addTransport(transport, message);
				
				// Remove the transport from us for Garbage Collection
				this.sTransports.remove(transport);
				
				// Notify of new endpoint. NOTE: This means OPEN will never be triggered on server endpoints
				// This is quite a departure from the previous mechanics.
				this.sDelegate.incomingTrapConnection(e, this, this.sContext);
				
				if (token != null)
				{
					
					// Add the endpoint to the cached ones.
					this.ccEndpoints.put(token, e);
					
					// Schedule a task to remove the endpoint from the cached ones
					var mt = this;
					setTimeout(function() {
						mt.ccEndpoints.remove(token);
					}, this.concurrentConnectionWindow);
				}
			}
			else
			{
				// Add the transport, preventing duplicates
				e.addTransport(transport, message);
				this.sTransports.remove(transport);
			}
			
		}
		catch (ex)
		{
			this.logger.warn(ex);
		}
	}
};

/**
 * On an incoming connection, we need to perform two things. First, we need to add the listener as a delegate of the transport. It will wait for an incoming message, and, once it arrives,
 * dispatch the transport to the appropriate recipient (or a new endpoint, if applicable).
 *
 * (non-Javadoc)
 * @see com.ericsson.research.trap.spi.ListenerTrapTransportDelegate#ttsIncomingConnection(com.ericsson.research.trap.spi.TrapTransport, com.ericsson.research.trap.spi.ListenerTrapTransport, java.lang.Object)
 * @param {Trap.Transport} connection
 * @param {Trap.ListenerTransport} server
 * @param {Object} context
 */
Trap.ListenerEndpoint.prototype.ttsIncomingConnection = function(connection, server, context)
{
	connection.setTransportDelegate(this, null);
	this.sTransports.add(connection);
	
	/*
	 * Add a timeout (30 secs) for a transport to get out of sTransports or be forcibly removed.
	 */
	
	var mt = this;
	setTimeout(function() {
		
		mt.sTransports.remove(connection);
		
	}, 30000);
};

/**
 * @param {Trap.ListenerDelegate} delegate
 * @param {Object} context
 */
Trap.ListenerEndpoint.prototype.listen = function(delegate, context)
{
	this.sDelegate = delegate;
	this.sContext = context;
	
	// Now enable listening
	for (var i = 0; i < this.transports.size(); i++)
	{
		var t = this.transports.get(i);
		if (t.isEnabled())
			t.listen(this, null);
	}
	
	this.setState(Trap.Endpoint.State.OPEN);
};

Trap.ListenerEndpoint.prototype.getClientConfiguration = function()
{
	return this.getClientConfiguration(false);
};

/**
 * @param {Boolean} failOnUnreachable
 * @return {String}
 */
Trap.ListenerEndpoint.prototype.getClientConfiguration = function(failOnUnreachable)
{
	try
	{
		var out = new Trap.Configuration();
		for (var i = 0; i < this.transports.size(); i++)
		{
			var t = this.transports.get(i);
			if (t.isEnabled())
				t.getClientConfiguration(out, failOnUnreachable);
		}
		return out.toString();
	}
	catch (e)
	{
		this.logger.debug("Auto configuration disabled due to improperly configured transport; {}", e);
		return "";
	}
};

Trap.ListenerEndpoint.prototype.reconnect = function(timeout)
{
	throw "Cannot reconnect a listener. What you're doing is strange.";
};

/**
 * @param {Trap.Authentication} authentication
 */
Trap.ListenerEndpoint.prototype.setAuthentication = function(authentication)
{
	this.authentication = authentication;
};

Trap.ListenerEndpoint.prototype.close = function()
{
	this.setState(Trap.State.CLOSING);
	Trap.Endpoint.prototype.onEnd.call(this, null, null);
};

/**
 * @param {String} configuration
 */
Trap.ListenerEndpoint.prototype.configure = function(configuration)
{
	Trap.Endpoint.prototype.configure.call(this, configuration);
	this.concurrentConnectionWindow = this.config.getIntOption("trap.concurrent-connection-window", this.concurrentConnectionWindow);
};

