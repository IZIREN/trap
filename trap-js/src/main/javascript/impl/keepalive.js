Trap.Keepalive = {};
Trap.Keepalive.Policy = {
		DISABLED: -1,
		DEFAULT: 0
};

// Note that unlike api classes, the predictor classes are carbon copies of Java. I figure, internally
// we will only waste time with niceties exposed to developers
Trap.Keepalive.StaticPredictor = function ()
{
	
	this.keepaliveInterval	= Trap.Keepalive.Policy.DISABLED;
	
	// Keepalive engine stuff
	/**
	 * The default keepalive interval.
	 */
	this.mKeepaliveInterval	= 30;
	
	/**
	 * Number of seconds to wait at least between keepalives
	 */
	this.minKeepalive		= 1;
	
	/**
	 * Number of seconds to wait at most between keepalives
	 */
	this.maxKeepalive		= 999999;
	
	// Automatic keepalive interval optimisation
	
	this.lastInterval		= this.mKeepaliveInterval;
	
	this.growthStep			= 0;

	this.nextInterval		= this.mKeepaliveInterval + this.growthStep;
	
	/**
	 * The minimum keepalive value that the automatic keepalive algorithm is
	 * allowed to decrease the keepalive to. The auto keepalive algorithm is
	 * only active on transports that can connect (i.e. reconnect) if it fails
	 * them.
	 */
	this.minAutoKeepalive	= 1;
	
	/**
	 * The minimum keepalive value that the automatic keepalive algorithm is
	 * allowed to decrease the keepalive to. The auto keepalive algorithm is
	 * only active on transports that can connect (i.e. reconnect) if it fails
	 * them. In addition, if keepalivepolicy != default, the automatic algorithm
	 * is disabled, as well as when min/max auto keepalives are negative
	 * numbers.
	 */
	this.maxAutoKeepalive	= 28 * 60;
	
	/**
	 * Timestamp of last recorded keepalive received
	 */
	this.lastDataReceived	= 0;
	this.lastDataSent	= 0;
	this.lastSentKeepalive		= 0;

	this.keepaliveTask			= null;
	this.keepaliveTaskTime		= 0;
	this.keepaliveExpiryMsec	= 5000;

	/**
	 * Byte array containing the most recently sent keepalive message from this
	 * predictor.
	 */
	this.keepaliveData			= null;
	
	this.started				= false;

	this.delegate = null;

	this.setMinKeepalive = function(min)
	{
		this.minKeepalive = min;
	}
	
	this.setMaxKeepalive = function(max)
	{
		this.maxKeepalive = max;
	}
	
	this.setMinAutoKeepalive = function(min)
	{
		this.minAutoKeepalive = min;
	}
	
	this.setMaxAutoKeepalive = function(max)
	{
		this.maxAutoKeepalive = max;
	}
	
	this.setKeepaliveInterval = function(interval)
	{
		this.keepaliveInterval = interval;
		
		if (interval == Trap.Keepalive.Policy.DEFAULT)
			this.nextInterval = this.mKeepaliveInterval;
		else if (interval == Trap.Keepalive.Policy.DISABLED)
			this.nextInterval = -1;
		else
		{
			// Basically, ensure that the interval is within the allowed range
			if ((interval > this.maxKeepalive) || (interval < this.minKeepalive))
				this.nextInterval = this.mKeepaliveInterval;
			else
				this.nextInterval = interval;
		}
		
	}
	
	this.getKeepaliveInterval = function()
	{
		return this.keepaliveInterval;
	}

	this.getNextKeepaliveSend = function()
	{
		// When do we expect the next keepalive?
		var earliestTime = Math.min(this.lastDataReceived, this.lastDataSent);
		var expected = earliestTime + (this.nextInterval * 1000);
		var actual = new Date().valueOf();
		var difference = expected - actual;
		
		return difference;
	}
	
	this.keepaliveReceived = function(isPing, pingType, timer, data)
	{
		if (!isPing)
		{

			// Check if this is a PING we have sent
			if (data != this.keepaliveData)
				return;
			
			this.keepaliveData = null;
			
			switch (pingType)
			{
			// Keepalives disabled

				case '1':
					break; // Do nothing; we will not auto-adjust
					
				case '2':
					this.setKeepaliveInterval(timer); // Manual adjustment
					break;
				
				case '3': // Manually triggered keepalive
					break;
				
				default: // no-error
			}
			
			// Now reschedule ourselves. The received keepalive will already have been recorded as per dataReceived()
			this.schedule();
		}
		else
		{
			this.delegate.get().shouldSendKeepalive(false, this.getPingType(), this.nextInterval, data);
		}
	}
	
	this.nextKeepaliveReceivedDelta = function()
	{
		
		if (this.keepaliveData == null)
			return Number.MAX_VALUE; // NEVER! We haven't sent a keepalive so we don't expect one. DUH.
		
		var expected = this.lastSentKeepalive;
		var actual = new Date().valueOf();
		return expected - actual;
	}
	
	this.setDelegate = function(delegate)
	{
		this.delegate = { get : function() { return delegate; } };
	}
	
	this.setKeepaliveExpiry = function(msec)
	{
		this.keepaliveExpiryMsec = msec;
		this.schedule();
	}
	
	this.getKeepaliveExpiry = function()
	{
		return this.keepaliveExpiryMsec;
	}
	
	this.start = function()
	{
		if (this.getKeepaliveInterval() == Trap.Keepalive.Policy.DISABLED)
			return;
		
		if (this.started)
		{
			this.schedule();
			return;
		}
		
		
		if (this.nextKeepaliveReceivedDelta() <= 0)
			this.lastReceivedKeepalive = new Date().valueOf();
		
		this.keepaliveData = null;
		this.lastSentKeepalive = 0;
		this.keepaliveTaskTime = 0;

		this.started = true;

		this.schedule();

	}
	
	this.stop = function()
	{
		
		if (!this.started)
			return;

		if (this.keepaliveTask != null)
		{
			this.keepaliveTask.cancel();
			this.keepaliveTask = null;
		}
		
		this.started = false;
	}
	
	this.schedule = function()
	{
		
		if (this.getKeepaliveInterval() == Trap.Keepalive.Policy.DISABLED)
			return;
		
		if (!this.started)
			return;
		
		// Next send should auto-disable if there is an outstanding ping/pong waiting
		var nextSend = (this.keepaliveData == null ? this.getNextKeepaliveSend() : Number.MAX_VALUE);
		var nextReceive = this.nextKeepaliveReceivedDelta() + (this.keepaliveData == null ? 0 : this.keepaliveExpiryMsec);
		var msec = Math.min(nextSend, nextReceive);
		
		if (msec <= 500)
		{
			//this.run();
			//return;
			msec = 501;
		} 
		
		var scheduledTime = msec + new Date().valueOf();
		
		// no-op: we want to schedule for longer time than the current expiry (expiry will re-schedule)
		// cancel: we want to schedule for shorter time than the current expiry
		if (this.keepaliveTask != null)
		{
			// Ensure we don't schedule if a task is going to happen closer, but in the future
			if ((this.keepaliveTaskTime <= (scheduledTime+250)) && (this.keepaliveTaskTime > new Date().valueOf()))
				return;
			
			this.keepaliveTask.cancel();
		}
		
		this.keepaliveTaskTime = scheduledTime;

		var mt = this;
		
		this.keepaliveTask = {
				run : function() { mt.run(); },
				cancel : function() { clearTimeout(this.timeout); }
		};
		
		this.keepaliveTask.timeout = setTimeout(this.keepaliveTask.run, msec);

	}
	
	this.run = function()
	{
		var delegate = this.delegate.get();
		
		if (delegate == null)
		{
			this.stop();
			return; // Delegate garbage collected; nothing to keep notifying about
		}
		
		// Check if we have been disabled...
		if (this.getKeepaliveInterval() == Trap.Keepalive.Policy.DISABLED)
		{
			this.stop();
			return;
		}
		// Now check for timeout
		
		var msec = this.nextKeepaliveReceivedDelta();
		
		if ((msec < 0) && (-msec > this.keepaliveExpiryMsec))
		{
			// Don't re-schedule this task on non-expired timeout
			delegate.predictedKeepaliveExpired(this, -msec);
			this.stop();
			return;
		}
		
		// Is it time to send a keepalive?
		
		msec = this.getNextKeepaliveSend();
		if (msec <= 0)
		{
			
			if (this.keepaliveData != null)
			{
				// OOps?
				//System.err.println("EXPERIMENTAL: keepalive data != null when expired timer... Dropping sending a keepalive.");
			}
			else
			{
				
				this.keepaliveData  = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
				    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
				    return v.toString(16);
				}); 
				this.lastSentKeepalive = new Date().valueOf();
				this.lastInterval = this.nextInterval;
				delegate.shouldSendKeepalive(true, this.getPingType(), this.nextInterval, this.keepaliveData);
				
			}
		}
		
		// reschedule ourselves for a default time
		this.keepaliveTaskTime = 0;
		
		var mt = this;
		
		// This timeout prevents us from super-recursing
		setTimeout(function() { mt.schedule(); }, 1);
	}
	
	this.getPingType = function()
	{
		var type = '1';
		
		if (this.getKeepaliveInterval() > 0)
			type = '2';
		
		return type;
	}
	
	this.dataReceived = function() {
		this.lastDataReceived = new Date().valueOf();
	};
	
	this.dataSent = function() {
		this.lastDataSent = new Date().valueOf();
	};
	
	
};