"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResult = {
  0: { transcript: string };
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;

  const speechWindow = window as SpeechRecognitionWindow;
  return (
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  );
}

function getVoiceErrorMessage(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Разрешите доступ к микрофону в настройках браузера.";
    case "audio-capture":
      return "Микрофон недоступен. Проверьте подключение и разрешения.";
    case "no-speech":
      return "Речь не распознана. Попробуйте говорить чуть громче.";
    case "network":
      return "Сервис распознавания речи недоступен.";
    case "language-not-supported":
      return "Русский язык не поддерживается этим сервисом распознавания.";
    default:
      return "Не удалось распознать речь. Попробуйте ещё раз.";
  }
}

export function useVoiceInput(onTranscript: (transcript: string) => void) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setError("Голосовой ввод не поддерживается этим браузером.");
      return;
    }

    recognitionRef.current?.abort();

    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = ({ resultIndex, results }) => {
      const transcript = [];

      for (let index = resultIndex; index < results.length; index += 1) {
        const phrase = results[index]?.[0]?.transcript.trim();
        if (phrase) transcript.push(phrase);
      }

      if (transcript.length > 0) {
        onTranscriptRef.current(transcript.join(" "));
      }
    };

    recognition.onerror = ({ error: recognitionError }) => {
      if (recognitionRef.current !== recognition) return;

      setError(getVoiceErrorMessage(recognitionError));
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;

      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setError("");
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      setError("Не удалось включить микрофон.");
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return {
    error,
    isListening,
    toggle,
  };
}
