/**
 * <b>Never instantiate a channel manually</b>. Trap will manage the channels.
 * 
 * @constructor
 * @param {Trap.Endpoint} endpoint The endpoint that spawned this channel.
 * @param {Number} channelID The channel ID being created
 * @classdesc A channel is a logical stream of Trap messages, multiplexed on the
 *            same Trap connection. Essentially, this allows sending multiple
 *            streams over the same connection. This is useful when multiple
 *            forms of data may need to be transported over a Trap session (e.g.
 *            short and long messages mixed), where a long/large message should
 *            not hold up a short/small message.
 *            <p>
 *            In the default case, there are two channels on every TrapEndpoint.
 *            Channel ID 0 will consist of control traffic, ensuring the
 *            endpoint is alive, managing transports, etc. It will have the
 *            highest priority, ensuring the endpoint can manage itself. Channel
 *            ID 1 will consist of application data. It will yield to Channel ID
 *            0, ensuring that the application sending large messages will not
 *            cause control traffic to time out.
 *            <p>
 *            Trap version 1.2 supports up to 256 different channels. It is not
 *            recommended that Channel ID 0 is used for application data,
 *            leaving 255 channels for the application to use. Each channel can
 *            have its features individually configured.
 *            <p>
 *            When instantiated, channels have certain default settings. Trap's
 *            default implementation will use a chunk size of 16KB, and limit to
 *            128KB in-flight bytes per channel. The channels will not operate
 *            in streaming mode by default. The default priority will be 0,
 *            except for Channel ID 0 which has the maximum priority.
 *            <p>
 *            The in-flight window will limit the throughput on fast links,
 *            while preventing us from oversaturating slow links. As an example,
 *            assuming 100ms latency and 128kb window size, we will at most
 *            process 10 windows per second, or 1280kb/s. 10ms latency yields
 *            12800kb/s. Increasing the window size on a faster link will yield
 *            more throughput, but may risk oversaturating a slower link.
 * 
 * @property {Boolean} streamingEnabled Controls the <i>streaming</i> flag of
 *           the channel. When a channel works in streaming mode, it will
 *           dispatch trapData events as data is received, although always in
 *           the correct order. With streaming mode disabled, each trapData
 *           event will represent a single send() event on the other side.
 *           <p>
 *           Streaming mode is useful for when Trap is used to transfer larger
 *           chunks of data, whose framing is internal to the data transferred.
 *           For example, an image, a song, or a video stream. Streaming mode
 *           will reduce – but not eliminate – the amount of buffering done in
 *           Trap.
 * 
 * @property {Integer} chunkSize The maximum number of bytes allowed in each
 *           message. Note that the chunk size includes the Trap message header,
 *           and this will be automatically subtracted from <i>numBytes</i>,
 *           unless numBytes is in the range of [1, TRAP_HEADER_SIZE]. If
 *           numBytes is zero or negative, chunking will be disabled.
 *           <p>
 *           Note that a chunkSize of Integer.MAX_VALUE will disable chunking. A
 *           channel will have that value set if the remote endpoint is
 *           suspected of not supporting chunking. Excepting that, chunkSize
 *           will automatically be reduced to the trap config option
 *           {@link TrapEndpoint#OPTION_MAX_CHUNK_SIZE}, which is automatically
 *           negotiated between the peers.
 * 
 * @property {Integer} maxInFlightBytes The maximum number of in-flight bytes.
 *           Combined with the chunk size, this limits the number of messages
 *           that the channel will allow to be in transit at any given time.
 *           <p>
 *           Increasing the number of in flight bytes will increase the required
 *           buffer sizes on both the local and remote ends, as well as the
 *           system's network buffers. It may also increase throughput,
 *           especially on congested links or when using multiple transports.
 *           <p>
 *           Note that in-flight bytes differs from the queue size. The queue
 *           denotes how many messages/bytes this channel can buffer, while
 *           in-flight bytes denotes how many messages/bytes we allow on the
 *           network.
 * 
 * @property {Integer} priority The channel priority, relative to the other
 *           channels. Channel ID 0 has priority {@link Integer#MAX_VALUE},
 *           meaning any traffic on 0 takes precedence of any other traffic, for
 *           any reason.
 *           <p>
 *           Priority is byte based. A channel with priority <i>n</i> will be
 *           allowed to send up to <i>n</i> bytes before ceding transmission
 *           rights to a transport with lower priority. Note that if
 *           <i>chunkSize</i> exceeds priority, the transport will nevertheless
 *           be allowed to send <i>chunkSize</i> number of bytes.
 *           <p>
 *           Priority only affects the scheduling order of messages, and not the
 *           throughput. For the exact buffering, one must consider the
 *           channel's in-flight limit, the endpoint's in-flight limit (if any),
 *           as well as the transports' in-flight limit.
 */
Trap.Channel = function(endpoint, channelID) {
	this._parentEP = endpoint;
	this._channelID = channelID;
	this._streamingEnabled = false;
	this._chunkSize = 16 * 1024;
	this._maxInFlightBytes = this._chunkSize * 8;
	this._bytesInFlight = 0;
	this._available = false;

	this._messageId = 1;
	this._maxMessageId = 0x8000000;
	this._priority = 0;

	this._outQueue = new Trap.List();
	this._inBuf = new Trap.MessageBuffer(50, 1000, 1, 1, this.maxMessageId);

	this.failedMessages = new Trap.List();

	this.tmp = {};
	this.buf = new Trap.ByteArrayOutputStream();
	this.receivingFragment = false;

};

Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "parentEP");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "channelID");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "streamingEnabled");
Trap._compat.__defineGetter(Trap.Channel.prototype, "chunkSize");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "maxInFlightBytes");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "bytesInFlight");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "available");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "messageId");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "maxMessageId");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "outQueue");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "inBuf");
Trap._compat.__defineGetterSetter(Trap.Channel.prototype, "priority");

Trap._compat.__defineSetter(Trap.Channel.prototype, "chunkSize", function(
		numBytes) {
	var newSize = numBytes;

	if (newSize > 16)
		newSize -= 16;

	if (newSize > this.parentEP.getMaxChunkSize())
		newSize = this.parentEP.getMaxChunkSize();

	if (newSize <= 0)
		newSize = Integer.MAX_VALUE;

	this._chunkSize = newSize;
	return this;
});

/*
 * @param {Trap.Message} message @return null
 */
Trap.Channel.prototype.assignMessageID = function(message) {
	if (message.getMessageId() == 0) {
		// Assign message id (if not already set)
		var messageId = this.messageId++;

		if (messageId > this.maxMessageId)
			this.messageId = messageId = 1;

		message.setMessageId(messageId);
	}
};

/*
 * Send a message on the channel. If required, splits up the message in multiple
 * component parts. Note that calling this method guarantees the message will be
 * serialized.
 * 
 * @param {Trap.Message} message The message to send. @throws TrapException If
 * an error occurs during sending @return void
 */
Trap.Channel.prototype.send = function(message, disableChunking) {

	this.assignMessageID(message);

	// Perform the estimate computation.
	if (!disableChunking) {
		var data = message.getCompressedData();
		if (data != null && data.length > this.chunkSize) {

			// We need to chunk it up.
			for ( var i = 0; i < data.length; i += this.chunkSize) {
				var chunk = Trap.subarray(data, i, Math.min(i + this.chunkSize,
						data.length));
				var m = new Trap.Message();
				m.setData(chunk);

				if (i == 0) {
					m.setOp(Trap.Message.Operation.FRAGMENT_START);
					m.setMessageId(message.getMessageId());
				} else if (i + this.chunkSize >= data.length)
					m.setOp(Trap.Message.Operation.FRAGMENT_END);
				else
					m.setOp(Trap.Message.Operation.MESSAGE);

				m.setCompressed(message.getCompressed());
				m.setFormat(message.getFormat());
				this.send(m, true);
			}

			return;

		}
	}

	message.setChannel(this.channelID);
	this.outQueue.addLast(message);

	if (this.bytesInFlight < this.maxInFlightBytes)
		this.available = true;
};

/*
 * @param {Trap.Message} message @return void
 */
Trap.Channel.prototype.messageSent = function(message) {
	this.bytesInFlight -= message.length();

	if (this.bytesInFlight < this.maxInFlightBytes
			&& this.outQueue.peek() != null)
		this.available = true;

	this.parentEP.kickSendingThread();
};

/*
 * @param {Trap.Message} failedMessage @return null;
 */
Trap.Channel.prototype.addFailedMessage = function(failedMessage) {
	this.failedMessages.add(failedMessage);
};

Trap.Channel.prototype.rebuildMessageQueue = function() {

	if (this.failedMessages.isEmpty())
		return;

	// We should iterate over the failed messages and remove them from the
	// transit messages

	var fit = this.failedMessages.iterator();
	while (fit.hasNext())
		this.bytesInFlight -= fit.next().length();

	var newMessageQueue = new Trap.List();

	// Rebuild the queue easily.
	var newQueue = new LinkedList();

	var it = this.failedMessages.iterator();

	var failed = it.next();

	while (failed != null && failed.getMessageId() == 0) {
		if (it.hasNext())
			failed = it.next();
		else
			failed = null;
	}

	var queued = this.outQueue.peek();

	while ((failed != null) || (queued != null)) {

		if (queued != null)
			this.outQueue.pop();

		if ((queued != null) && (failed != null)) {
			if (queued.getMessageId() < failed.getMessageId()) {
				newQueue.add(queued);
				queued = null;
			} else {
				newQueue.add(failed);
				failed = null;
			}
		} else if (failed == null) {
			newQueue.add(queued);
			queued = null;
		} else {
			newQueue.add(failed);
			failed = null;
		}

		if ((failed == null) && it.hasNext())
			failed = it.next();

		if (queued == null)
			queued = this.outQueue.peek();
	}

	// We'll need a new loop to eliminate duplicates.
	// This loop will actually defer the messages.
	var lastMessageId = -1;

	var ni = newQueue.iterator();

	while (ni.hasNext()) {
		var m = ni.next();

		if (m.getMessageId() != lastMessageId) {

			lastMessageId = m.getMessageId();
			newMessageQueue.put(m);
		}
	}

	this.outQueue = newMessageQueue;
	this.failedMessages.clear();

	if (this.bytesInFlight < this.maxInFlightBytes
			&& this.outQueue.peek() != null) {
		this.available = true;
	}

};

/*
 * 
 * @returns {Boolean}
 */
Trap.Channel.prototype.messagesAvailable = function() {
	return this.available;
};

/*
 * 
 * @returns {Trap.Message}
 */
Trap.Channel.prototype.peek = function() {
	if (this.messagesAvailable())
		return this.outQueue.peek();

	return null;
};

/*
 * @returns {Trap.Message}
 */
Trap.Channel.prototype.pop = function() {
	var message = null;

	message = this.outQueue.pop();

	if (message != null)
		this.bytesInFlight += message.length();

	if (this.outQueue.peek() == null
			|| this.bytesInFlight >= this.maxInFlightBytes)
		this.available = false;

	return message;
};

/*
 * @param {Trap.Message} m @param {Trap.Transport} t @returns void
 */
Trap.Channel.prototype.receiveMessage = function(m, t) {
	this.inBuf.put(m, t);

	for (;;) {
		try {
			while (this.inBuf.fetch(this.tmp, false)) {

				if (!this.streamingEnabled) {
					if (this.receivingFragment) {
						switch (this.tmp.m.getOp()) {
						case Trap.Message.Operation.FRAGMENT_END:
							this.receivingFragment = false;
							this.tmp.m.setOp(Trap.Message.Operation.MESSAGE);
						case Trap.Message.Operation.MESSAGE:
							this.buf.write(this.tmp.m.getData());
							break;

						default:
							break;
						}

						if (!this.receivingFragment) {
							this.tmp.m.setData(this.buf.toArray());

							if (this.tmp.m.getCompressed())
								this.tmp.m.setData(new Zlib.Inflate(this.tmp.m
										.getData()).decompress());

							this.buf = new Trap.ByteArrayOutputStream();
						} else {
							continue;
						}
					} else {
						if (this.tmp.m.getOp() == Trap.Message.Operation.FRAGMENT_START) {
							this.receivingFragment = true;
							this.buf.write(this.tmp.m.getData());
							continue;
						}
					}
				}

				this.parentEP.executeMessageReceived(this.tmp.m, this.tmp.t);
			}

		} catch (e) {
			console.log(e.stack);
		} finally {
			// System.out.println("Exiting run loop with available: " +
			// this.inBuf.available());
		}

		if (this.inBuf.available() > 0)
			continue;

		return;
	}
};

Trap.Channel.prototype.toString = function() {
	return "(" + this.channelID + "/o:" + this.outQueue.length() + "/i:"
			+ this.inBuf.toString() + ")";
};
