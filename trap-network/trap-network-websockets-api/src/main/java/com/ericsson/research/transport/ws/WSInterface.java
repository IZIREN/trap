package com.ericsson.research.transport.ws;

/*
 * ##_BEGIN_LICENSE_## Transport Abstraction Package (trap) ---------- Copyright (C) 2014 Ericsson AB ---------- Redistribution
 * and use in source and binary forms, with or without modification, are permitted provided that the following conditions are
 * met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
 * disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of the Ericsson AB nor the names of its contributors may be used to endorse or promote products derived
 * from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING,
 * BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE. ##_END_LICENSE_##
 */

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.HashMap;

public interface WSInterface
{
    
    public String getOrigin();
    
    public String getHost();
    
    public String getPath();
    
    public URI getUri();
    
    public HashMap<String, String> getHeaders();
    
    void open() throws IOException;
    
    void setReadListener(WSListener listener);
    
    void send(byte[] binaryData) throws IOException;
    
    void send(String utf8String) throws IOException;
    
    void ping(byte[] payload) throws IOException;
    
    void close();
    
    void close(int code, String reason);
    
    public InetSocketAddress getLocalSocketAddress();
    
    public InetSocketAddress getRemoteSocketAddress();
}
