//<needs(trap)
/**
 * Circular buffer of TrapMessages and TrapTransports they arrived on. The
 * message buffer works using random inserts and regular reads. The buffer needs
 * to be initialised with a size (can be automatically increased) and initial
 * expected message id. The buffer will use this expected message ID to seed
 * itself with and be able to receive messages from history.
 * <p>
 * The buffer will automatically sort messages for reading. If messages are read
 * in order, there is no performance penalty for accesses. If messages come from
 * outside the buffer's range, there is a performance penalty, based on buffer
 * settings.
 * <p>
 * To put it another way, it is a self-growing, circular object buffer
 * implementing random write and sequential read.
 * 
 * @author Vladimir Katardjiev
 * @param {int} bufSize 
 * @param {int} maxBufSize 
 * @param {int} startMessageId 
 * @param {int} minMessageId 
 * @param {int} maxMessageId 
 */

//> (Trap.MessageBuffer) fn(int bufSize, int maxBufSize, int startMessageId, int minMessageId, int maxMessageId)
Trap.MessageBuffer = function(bufSize, maxBufSize, startMessageId, minMessageId, maxMessageId)
{

	/**
	 * @private
	 */
	this.buffer = new Array(bufSize);
	
	this.minMessageId = minMessageId;
	this.maxMessageId = maxMessageId;
	
	this.bufGrowthSize = bufSize;
	this.maxBufSize = maxBufSize;
	
	this.readMessageID = this.writeMessageID = startMessageId;
	
	this.fillEmptyBuf = function(buffer)
	{
		for (var i=0; i<buffer.length; i++)
		{
			var m = buffer[i];
			
			if (m == null)
				buffer[i] = {m: null, t: null};
		}
	};
	
	this.fillEmptyBuf(this.buffer);
	
	this.available = function()
	{
		return this.writeMessageID - this.readMessageID;
	};

	this.put = function(m, t)
	{
		
		// Step 1: Input validation.
		var messageId = m.getMessageId();
		
		if (messageId > this.maxMessageId || messageId < this.minMessageId)
			throw "Message ID [" + messageId + "] outside of acceptable range [" + this.minMessageId + ", " + this.maxMessageId + "].";
		
		// Message IDs can be reused (and reusing them won't cleanly fit in the buffer.
		// In those wrapping cases, we'll need to up the effective messageId appropriately.
		// TODO: Better constant?
		if (messageId < this.readMessageID)
		{
			if  ((this.readMessageID - messageId) > (this.maxMessageId - this.minMessageId) / 2)
				messageId += this.maxMessageId - this.minMessageId + 1;
			else
				return; // Skip duplicated message.
		}
		
		// Assert that the message has a chance at fitting inside the buffer
		if (messageId > (this.readMessageID + this.maxBufSize))
			throw "Message ID [" + messageId + "] outside of buffer size. First message has ID [" + this.readMessageID + "] and max buffer size is " + this.maxBufSize;
		
		// Assert the message has not already been written.
		if (messageId < this.writeMessageID)
			return; // This should be a safe operation. It just means the message is duplicated.
			
		// At this point in time we know that:
		// 1) The message will fit in the buffer [writeMessageID, readMessageId+maxBufSize]
		// 2) The message is in that range and has not already been written.
		// We now need to ensure the buffer is large enough
		// This is a STRICT equality. Proof: buffer.length == 1, buffer[0] != null => buffer is full
		if (messageId >= (this.readMessageID + this.buffer.length))
		{
			// This is a simple operation. Resize the old buffer into a new one by flushing out the current messages.
			var newSize = messageId - this.readMessageID;
			// The new size should be a multiple of bufGrowthSize
			newSize /= this.bufGrowthSize;
			newSize++;
			newSize *= this.bufGrowthSize;
			
			var newBuf = new Array(newSize);
			this.fillEmptyBuf(newBuf);
			
			// Move all slots from the old buffer to the new one, recalculating the modulus as applicable.
			// We have to move all slots as we don't track which ones have been filled.
			for (var i = 0; i < this.buffer.length; i++)
			{
				var tmp = this.buffer[i];
				if (tmp.m != null)
					newBuf[tmp.m.getMessageId() % newBuf.length] = tmp;
			}
			
			this.buffer = newBuf;
			
		}
		
		// Where are we now? Well, that's the rad part. We now know that messageId will comfortably fit in our world so all we need to do is fill it.
		var slot = this.buffer[messageId % this.buffer.length];
		slot.m = m;
		slot.t = t;
		
		//System.out.println("Wrote message with ID " + messageId + " and expected ID " + writeMessageID);
		
		// Final step is to increment the writeMessageId entry, if applicable.
		if (messageId == this.writeMessageID)
		{
			do
			{
				var expectedMessageId = this.writeMessageID;
				
				if (expectedMessageId > this.maxMessageId)
					expectedMessageId -= this.maxMessageId - this.minMessageId + 1;
				
				// Bug catch verification. Logically, writeMessageID should be the message ID of the current slot's message. If they don't match, we're in deep doodoo
				if (slot.m.getMessageId() != expectedMessageId)
					throw "Trap Message Buffer corrupted. Unexpected message ID found. This needs debugging...";
				
				// Increment by one.
				this.writeMessageID++;
				// Fetch the next entry
				slot = this.buffer[this.writeMessageID % this.buffer.length];
				
			} while (slot.m != null && (this.writeMessageID - this.readMessageID) < this.buffer.length);
		}

	};
	
	this.fetch = function(target, skipEmpty)
	{
		// Nothing to read here, move along...
		if (this.readMessageID >= this.writeMessageID)
		{
			target.m = null;
			target.t = null;
			return false;
		}
		try
		{
			var m = null;
			for (;;)
			{
				
				m = this.buffer[this.readMessageID % this.buffer.length];
				
				if (m.m != null)
				{
					//System.out.println("Read message with ID " + m.m.getMessageId() + " and expected ID " + this.readMessageID);
					this.readMessageID++;
					target.m = m.m;
					target.t = m.t;
					m.m = null;
					m.t = null;
					return true;
				}
				else
				{
					if (skipEmpty && this.readMessageID < this.writeMessageID)
					{
						this.readMessageID++;
					}
					else
					{
						return false;
					}
				}
			}
		}
		catch(e)
		{
			throw e;
		}
		finally
		{
			// If we have wrapped around the messages, we can finally throw ourselves a bone and reduce the message IDs to handle wrapping gracefully.
			if (this.readMessageID > this.maxMessageId)
			{
				// The easiest way is to just create a new buffer and refill it.
				// This is a fairly expensive operation, but it should only happen once every billion messages or so, so we can consider
				// the cost amortized.
				var newBuf = new Array(this.buffer.length);
				this.fillEmptyBuf(newBuf);
				
				this.readMessageID -= this.maxMessageId - this.minMessageId + 1;
				this.writeMessageID -= this.maxMessageId - this.minMessageId + 1;
				
				// Recalculation can and should be based on the message IDs. This prevents us from doing expensive errors.
				for (var i = 0; i < newBuf.length; i++)
				{
					var tmp = this.buffer[i];
					if (tmp.m != null)
						newBuf[tmp.m.getMessageId() % newBuf.length] = tmp;
				}
				
				this.buffer = newBuf;
			}
		}
	};
	
};
