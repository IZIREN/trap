package com.ericsson.research.trap.spi.sockettest;

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

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Level;

import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;

import com.ericsson.research.trap.TrapClient;
import com.ericsson.research.trap.TrapEndpoint;
import com.ericsson.research.trap.TrapFactory;
import com.ericsson.research.trap.TrapListener;
import com.ericsson.research.trap.TrapState;
import com.ericsson.research.trap.delegates.OnAccept;
import com.ericsson.research.trap.delegates.OnData;
import com.ericsson.research.trap.impl.queues.CABMessageQueue;
import com.ericsson.research.trap.spi.queues.MessageQueue;
import com.ericsson.research.trap.utils.JDKLoggerConfig;
import com.ericsson.research.trap.utils.ThreadPool;

@RunWith(Parameterized.class)
public class SocketPerformanceTest implements OnAccept, OnData
{
    
    TrapEndpoint                         incomingEP;
    static TrapListener                  listener;
    static TrapClient                    c;
    static TrapEndpoint                  s;
    private static SocketPerformanceTest instance;
    
    AtomicInteger                        receivingCount = new AtomicInteger(0);
    int                                  messages       = 100000;
    
    @BeforeClass
    public static void setUp() throws Throwable
    {
        JDKLoggerConfig.initForPrefixes(Level.INFO);
        //Thread.sleep(10000);
        
        instance = new SocketPerformanceTest();
        
        listener = TrapFactory.createListener(null);
        listener.listen(instance);
        
        String cfg = listener.getClientConfiguration();
        c = TrapFactory.createClient(cfg, true);
        c.setDelegate(instance, true);
        c.open();
        
        // Accept
        
        MessageQueue sq = new CABMessageQueue(1000);
        s = instance.accept();
        s.setQueue(sq);
        
        while (c.getState() != TrapState.OPEN)
            Thread.sleep(10);
    }
    
    @Parameterized.Parameters
    public static List<Object[]> data()
    {
        if ("true".equals(System.getProperty("trap.stresstest")))
            return Arrays.asList(new Object[100][0]);
        else
            return Arrays.asList(new Object[10][0]);
    }
    
    @Test(timeout = 300000)
    public void testNormal() throws Exception
    {
        for (int i = 0; i < 1; i++)
            this.performMessageTests();
    }
    
    public void performMessageTests() throws Exception
    {
        
        final byte[] bytes = "Helloes".getBytes();
        
        instance.receivingCount = new AtomicInteger(0);
        ThreadPool.executeCached(new Runnable() {
            
            public void run()
            {
                for (int i = 0; i < SocketPerformanceTest.instance.messages; i++)
                {
                    try
                    {
                        SocketPerformanceTest.s.send(bytes);
                    }
                    catch (Throwable e)
                    {
                        e.printStackTrace();
                    }
                }
                
            }
            
        });
        
        while (instance.receivingCount.get() != instance.messages)
            Thread.sleep(10);
        
    }
    
    protected synchronized TrapEndpoint accept() throws InterruptedException
    {
        try
        {
            while (this.incomingEP == null)
                this.wait();
            
            return this.incomingEP;
        }
        finally
        {
            this.incomingEP = null;
        }
    }
    
    public synchronized void incomingTrapConnection(TrapEndpoint endpoint, TrapListener listener, Object context)
    {
        this.incomingEP = endpoint;
        endpoint.setDelegate(this, true);
        this.notify();
    }
    
    public void trapData(byte[] data, int channel, TrapEndpoint endpoint, Object context)
    {
        this.receivingCount.incrementAndGet();
    }
    
    public void trapStateChange(TrapState newState, TrapState oldState, TrapEndpoint endpoint, Object context)
    {
    }
    
    public void trapFailedSending(@SuppressWarnings("rawtypes") Collection datas, TrapEndpoint endpoint, Object context)
    {
    }
}
