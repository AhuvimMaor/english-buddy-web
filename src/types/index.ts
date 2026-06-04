import { Timestamp } from 'firebase/firestore';

export type EnglishLevel = 'beginner' | 'intermediate' | 'advanced';
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export interface TimeSlot {
  start: string;
  end: string;
}

export type WeeklyAvailability = Record<DayOfWeek, TimeSlot[]>;

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  englishLevel: EnglishLevel;
  nativeLanguage: string;
  availability: WeeklyAvailability;
  timezone: string;
  isOnline: boolean;
  inCall: boolean;
  fcmToken: string | null;
  totalCallMinutes: number;
  callCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
export type AnalysisStatus = 'pending' | 'transcribing' | 'analyzing' | 'complete' | 'failed';

export interface Call {
  id: string;
  callerId: string;
  calleeId: string;
  status: CallStatus;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  durationSeconds: number | null;
  recordingPath: string | null;
  transcription: string | null;
  analysisStatus: AnalysisStatus;
  createdAt: Timestamp;
  // Per-speaker recording fields are written at runtime with the speaker's uid
  // in the key, so they can't be statically typed on this interface:
  //   recording_${uid}: string              - legacy single-file path (fallback)
  //   recordingChunkPrefix_${uid}: string    - chunked upload folder prefix
  //   recordingChunkCount_${uid}: number     - number of uploaded slices
  //   recordingMime_${uid}: string           - MediaRecorder mime of the slices
  // See resolveRecording() in src/lib/recording.ts for how these are read.
}

export interface GrammarMistake {
  original: string;
  corrected: string;
  explanation: string;
}

export interface HebrewWord {
  hebrew: string;
  english: string;
  context: string;
}

export interface InlineCorrection {
  wrong: string;
  right: string;
  explanation: string;
}

export interface TranscriptLine {
  speaker: 'user' | 'partner';
  text: string;
  corrections: InlineCorrection[] | null;
}

export interface Report {
  id: string;
  callId: string;
  userId: string;
  partnerId: string;
  callDuration: number;
  transcript: TranscriptLine[];
  grammarMistakes: GrammarMistake[];
  hebrewWords: HebrewWord[];
  fluencyScore: number | null;
  summary: string;
  tips: string[];
  createdAt: Timestamp;
}

export interface IceCandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export type SignalingType = 'offer' | 'answer' | 'ice-candidate';

export interface SignalingMessage {
  type: SignalingType;
  from: string;
  sdp: string | null;
  candidate: IceCandidateData | null;
}
