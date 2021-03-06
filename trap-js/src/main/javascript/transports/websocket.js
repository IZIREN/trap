/**
 * @returns {Trap.Transports.WebSocket}
 */
Trap.Transports.WebSocket = function()
{
	Trap.AbstractTransport.call(this);
	this._transportPriority	= 0;
	this.keepaliveInterval = 28; // 28 seconds keepalive should keep us open through most NATs...
};

Trap.Transports.WebSocket.prototype = new Trap.AbstractTransport;
Trap.Transports.WebSocket.prototype.constructor = new Trap.Transports.WebSocket;

Trap.Transports.WebSocket.CONFIG_URI = "wsuri";

// Binary detection
try 
{ 
	var ws = new WebSocket("wss://127.0.0.1");
	
	if (typeof ws.binaryType === "string")
	    Trap.Transports.WebSocket.prototype.supportsBinary = ws.binaryType === "blob"; 
	
} catch(e){}

Trap.Transports.WebSocket.prototype.canConnect = function()
{
	// Check for WebSocket interface
	return (typeof(WebSocket) != "undefined" && WebSocket.prototype && WebSocket.prototype.send ? true : false);
};

Trap.Transports.WebSocket.prototype.getTransportName = function()
{
	return "websocket";
};

Trap.Transports.WebSocket.prototype.init = function() 
{

	Trap.AbstractTransport.prototype.init.call(this);
	
	if (this.ws)
	{
		this.ws.onopen = function() { };
		this.ws.onerror = function() { };
		this.ws.onclose = function() { };
		this.ws.onmessage = function() { };
	}
		
	this.ws = null;
	
};

Trap.Transports.WebSocket.prototype.getProtocolName = function()
{
	return "websocket";
};

Trap.Transports.WebSocket.prototype.internalSend = function(message, expectMore) 
{
	var data = message.serialize(this.useBinary);
	this.ws.send(data.buffer ? data.buffer : data);
};

Trap.Transports.WebSocket.prototype.flushTransport = function()
{
};

Trap.Transports.WebSocket.prototype.isClientConfigured = function()
{
	return !!this.getOption(Trap.Transports.WebSocket.CONFIG_URI);
};

Trap.Transports.WebSocket.prototype.internalConnect = function()
{
	var uri = this.getOption(Trap.Transports.WebSocket.CONFIG_URI);
	if (!uri)
	{
		this.logger.debug("WebSocket Transport not properly configured... Unless autoconfigure is enabled (and another transport succeeds) this transport will not be available.");
		this.setState(Trap.Transport.State.ERROR);
		return;
	}
	
	var uri = this.getOption(Trap.Transports.WebSocket.CONFIG_URI);
	this.logger.debug("WS Transport Opening");
	this.ws = new WebSocket(uri);
	this._initWS();
};

Trap.Transports.WebSocket.prototype.internalDisconnect = function()
{
	
	if ((this.getState() != Trap.Transport.State.DISCONNECTED) && (this.getState() != Trap.Transport.State.DISCONNECTED) && (this.getState() != Trap.Transport.State.ERROR))
			this.setState(Trap.Transport.State.DISCONNECTING);

	if (this.ws)
		this.ws.close();
	
};

//TODO: Expose IP information on websocket level...
Trap.Transports.WebSocket.prototype.fillAuthenticationKeys = function(keys)
{
};

Trap.Transports.WebSocket.prototype.updateContext = function()
{
	// TODO Auto-generated method stub
	
};

Trap.Transports.WebSocket.prototype._initWS = function()
{
	var mt = this;
	this.ws.onopen = function() { mt.notifyOpen(); };
	this.ws.onerror = function() { mt.notifyError(); };
	this.ws.onclose = function() { mt.notifyClose(); };
	this.ws.onmessage = function(e) { mt.notifyMessage(e.data); };
	
	if (this.useBinary && this.supportsBinary)
		this.ws.binaryType = "arraybuffer";
};

Trap.Transports.WebSocket.prototype.notifyError = function()
{
	this.setState(Trap.Transport.State.ERROR);
};

Trap.Transports.WebSocket.prototype.notifyOpen = function()
{
	this.logger.debug("WS Transport Connected");
	this.setState(Trap.Transport.State.CONNECTED);
};

Trap.Transports.WebSocket.prototype.notifyClose = function()
{
	this.ws = null;
	if(this.getState() != Trap.Transport.State.ERROR)
		this.setState(Trap.Transport.State.DISCONNECTED);
	this.logger.debug("WS Transport Disconnected");
};

Trap.Transports.WebSocket.prototype.notifyMessage = function(data)
{
	if (typeof(data) == "string")
	{
		// Data will be a Unicode string (16-bit chars). notifyData expects bytes though
		// Encode data as UTF-8. This will align the bytes with the ones expected from the server.
		data = data.toUTF8ByteArray();
		
		this.receive(data, 0, data.length);
	}
	else
	{
		this.receive(new Uint8Array(data));
	}
};