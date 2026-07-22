/// <reference types="vite/client" />

interface Window {
  SpeechRecognition?: new () => unknown
  webkitSpeechRecognition?: new () => unknown
}
