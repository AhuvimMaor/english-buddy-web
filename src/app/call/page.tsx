'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { db, storage } from '@/lib/firebase';
import { doc, addDoc, collection, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { WebRTCCall } from '@/lib/webrtc';

function CallContent() {
  const { firebaseUser } = useAuthContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const partnerId = searchParams.get('partnerId');
  const callIdParam = searchParams.get('callId');
  const isCallee = searchParams.get('role') === 'callee';

  const [partnerName, setPartnerName] = useState('');
  const [status, setStatus] = useState<'init' | 'ringing' | 'connected' | 'ended'>('init');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [callId, setCallId] = useState(callIdParam || '');
  const [error, setError] = useState('');
  const endingRef = useRef(false);

  const webrtcRef = useRef<WebRTCCall | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const durationRef = useRef(0);

  useEffect(() => {
    if (!partnerId) return;
    getDoc(doc(db, 'users', partnerId)).then(snap => {
      if (snap.exists()) setPartnerName(snap.data().displayName);
    });
  }, [partnerId]);

  // Set user status to "inCall" on mount, restore on unmount
  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, 'users', firebaseUser.uid);
    updateDoc(userRef, {
      inCall: true,
      isOnline: false,
      updatedAt: serverTimestamp(),
    });

    const resetStatus = () => {
      updateDoc(userRef, {
        inCall: false,
        isOnline: true,
        updatedAt: serverTimestamp(),
      });
    };

    window.addEventListener('beforeunload', resetStatus);
    return () => {
      window.removeEventListener('beforeunload', resetStatus);
      resetStatus();
    };
  }, [firebaseUser]);

  // Listen for other side hanging up
  useEffect(() => {
    if (!callId) return;
    const unsub = onSnapshot(doc(db, 'calls', callId), (snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.status === 'ended' && !endingRef.current) {
        handleRemoteHangup();
      }
      if (data.status === 'declined' || data.status === 'missed') {
        webrtcRef.current?.cleanup();
        router.push('/partners');
      }
    });
    return unsub;
  }, [callId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoteHangup = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setStatus('ended');
    if (timerRef.current) clearInterval(timerRef.current);

    const rtc = webrtcRef.current;
    if (rtc) {
      const blob = rtc.stopRecording();
      if (blob && callId && firebaseUser) {
        const storageRef = ref(storage, `recordings/${callId}/${firebaseUser.uid}.webm`);
        await uploadBytes(storageRef, blob);
      }
      await rtc.cleanup();
    }

    router.push(`/call/processing?callId=${callId}`);
  };

  const initCall = useCallback(async () => {
    if (!firebaseUser || !partnerId) return;

    let cid = callId;
    if (!isCallee) {
      const callRef = await addDoc(collection(db, 'calls'), {
        callerId: firebaseUser.uid,
        calleeId: partnerId,
        status: 'ringing',
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        recordingPath: null,
        transcription: null,
        analysisStatus: 'pending',
        createdAt: serverTimestamp(),
      });
      cid = callRef.id;
      setCallId(cid);
    }

    const rtc = new WebRTCCall(cid, firebaseUser.uid);
    webrtcRef.current = rtc;

    rtc.onRemoteStream = (stream) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    rtc.onConnectionState = (state) => {
      if (state === 'connected') {
        setStatus('connected');
        rtc.startRecording();
        timerRef.current = setInterval(() => {
          durationRef.current += 1;
          setDuration(d => d + 1);
        }, 1000);
      } else if (state === 'disconnected' || state === 'failed') {
        handleEnd();
      }
    };

    try {
      await rtc.start();
    } catch (err: any) {
      console.error('[Call] Mic access failed:', err);
      setError('Microphone access denied. Please allow microphone in browser settings.');
      return;
    }

    if (!isCallee) {
      await rtc.createOffer();
      setStatus('ringing');
    } else {
      await updateDoc(doc(db, 'calls', cid), {
        status: 'active',
        startedAt: serverTimestamp(),
      });
      setStatus('ringing');
    }
  }, [firebaseUser, partnerId, callId, isCallee]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    initCall();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnd = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setStatus('ended');
    if (timerRef.current) clearInterval(timerRef.current);

    const rtc = webrtcRef.current;
    if (rtc) {
      const blob = rtc.stopRecording();
      if (blob && callId && firebaseUser) {
        const storageRef = ref(storage, `recordings/${callId}/${firebaseUser.uid}.webm`);
        await uploadBytes(storageRef, blob);
        await updateDoc(doc(db, 'calls', callId), {
          recordingPath: `recordings/${callId}/${firebaseUser.uid}.webm`,
        });
      }
      await updateDoc(doc(db, 'calls', callId), {
        status: 'ended',
        endedAt: serverTimestamp(),
        durationSeconds: durationRef.current,
      });
      await rtc.cleanup();
    }

    router.push(`/call/processing?callId=${callId}`);
  };

  const handleMute = () => {
    const isMuted = webrtcRef.current?.toggleMute() ?? false;
    setMuted(isMuted);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-gradient-to-b from-slate-900 to-slate-800 text-white p-8">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="text-center pt-12">
        <p className="text-xl tabular-nums text-white/60">
          {status === 'connected' ? formatTime(duration) : ''}
        </p>
        {status === 'connected' && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-400 font-bold">REC</span>
          </div>
        )}
      </div>

      <div className="text-center">
        <div className="w-28 h-28 rounded-full bg-white/10 flex items-center justify-center text-5xl font-bold mx-auto mb-6">
          {partnerName ? partnerName.charAt(0).toUpperCase() : '?'}
        </div>
        <h2 className="text-2xl font-bold">{partnerName || 'Connecting...'}</h2>
        <p className="text-white/50 mt-1">
          {error ? '' : status === 'init' && 'Setting up...'}
          {status === 'ringing' && (isCallee ? 'Connecting...' : 'Calling...')}
          {status === 'connected' && 'Connected'}
          {status === 'ended' && 'Call ended'}
        </p>
        {error && (
          <div className="mt-4 bg-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm max-w-xs">
            {error}
            <button onClick={() => router.push('/partners')} className="block mt-2 text-white underline">
              Go back
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-8 pb-12">
        <button
          onClick={handleMute}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition ${
            muted ? 'bg-white/20' : 'bg-white/10 hover:bg-white/15'
          }`}
        >
          {muted ? '🔇' : '🎤'}
        </button>

        <button
          onClick={handleEnd}
          className="w-18 h-18 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-3xl p-5 transition"
        >
          📞
        </button>

        <button className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-2xl transition">
          🔊
        </button>
      </div>
    </div>
  );
}

export default function CallPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    }>
      <CallContent />
    </Suspense>
  );
}
