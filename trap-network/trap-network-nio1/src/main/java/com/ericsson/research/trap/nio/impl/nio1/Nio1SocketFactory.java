package com.ericsson.research.trap.nio.impl.nio1;

/*
 * ##_BEGIN_LICENSE_##
 * Transport Abstraction Package (trap)
 * ----------
 * Copyright (C) 2014 Ericsson AB
 * ----------
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of the Ericsson AB nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
 * OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 * ##_END_LICENSE_##
 */

import java.io.IOException;

import javax.net.ssl.SSLContext;

import com.ericsson.research.transport.ManagedServerSocket;
import com.ericsson.research.transport.ManagedSocket;
import com.ericsson.research.transport.ssl.SSLServerSocket;
import com.ericsson.research.transport.ssl.SSLSocket;
import com.ericsson.research.trap.nio.ServerSocket;
import com.ericsson.research.trap.nio.ServerSocket.ServerSocketHandler;
import com.ericsson.research.trap.nio.Socket;
import com.ericsson.research.trap.nio.SocketFactory;

public class Nio1SocketFactory implements SocketFactory
{

	@Override
    public Socket client() throws IOException
    {
	    return new SocketWrapper(new ManagedSocket(), false);
    }

	@Override
    public Socket sslClient(SSLContext sslc) throws IOException
    {
	    return new SocketWrapper(new SSLSocket(sslc), true);
    }

	@Override
    public ServerSocket sslServer(SSLContext sslc, ServerSocketHandler handler) throws IOException
    {
	    return new ServerSocketWrapper(new SSLServerSocket(sslc), handler, true);
    }

	@Override
    public ServerSocket server(ServerSocketHandler handler) throws IOException
    {
	    return new ServerSocketWrapper(new ManagedServerSocket(), handler, false);
    }

}
