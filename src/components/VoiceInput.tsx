import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface VoiceInputProps {
  onTranscriptCaptured: (transcript: string) => void;
  isLoading: boolean;
}

export default function VoiceInput({ onTranscriptCaptured, isLoading }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Try Chrome/Safari.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => {
      setIsRecording(true);
      setTranscript("");
      setError(null);
    };

    rec.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      if (text.trim()) {
        onTranscriptCaptured(text);
      }
    };

    rec.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setError(`Error: ${event.error}`);
      setIsRecording(false);
    };

    rec.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = rec;
  }, [onTranscriptCaptured]);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Start recording failed:", err);
      }
    }
  };

  return (
    <div id="voice-input-container" className="flex flex-col items-center gap-3 p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button
          id="mic-toggle-btn"
          type="button"
          onClick={toggleRecording}
          disabled={isLoading || !!error}
          className={`relative p-5 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
            isRecording
              ? "bg-red-500 text-white animate-pulse shadow-red-500/50 scale-105"
              : "bg-teal-500 hover:bg-teal-400 text-slate-950 hover:scale-105"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isRecording ? "Stop Listening" : "Start Voice Task Intake"}
        >
          {isRecording ? (
            <MicOff className="w-6 h-6" />
          ) : isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Mic className="w-6 h-6" />
          )}

          {isRecording && (
            <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping -z-10" />
          )}
        </button>

        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-slate-100">
            {isRecording ? "Listening to you..." : "Voice-Enabled Intake"}
          </h3>
          <p className="text-xs text-slate-400 max-w-xs">
            {isRecording
              ? "Say something like: 'Finish the sales proposal by tomorrow evening at 5 PM high priority'"
              : "Tap mic to quickly speak and parse your next deadline into a smart task block."}
          </p>
        </div>
      </div>

      {isRecording && (
        <div className="flex items-center gap-1.5 py-1">
          <div className="w-1 h-3 bg-red-400 rounded-full animate-bounce delay-100" />
          <div className="w-1 h-5 bg-red-400 rounded-full animate-bounce delay-200" />
          <div className="w-1 h-4 bg-red-400 rounded-full animate-bounce delay-300" />
          <div className="w-1 h-6 bg-red-400 rounded-full animate-bounce delay-100" />
          <div className="w-1 h-3 bg-red-400 rounded-full animate-bounce delay-200" />
        </div>
      )}

      {transcript && (
        <div className="mt-2 text-xs text-slate-300 bg-slate-950/40 px-3 py-2 rounded-lg border border-slate-800/40 w-full text-center italic">
          "{transcript}"
        </div>
      )}

      {error && (
        <p className="text-xs text-amber-400/90 text-center">
          {error}
        </p>
      )}
    </div>
  );
}
