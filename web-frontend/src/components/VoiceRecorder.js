import React, { useState, useRef, useEffect } from 'react';
import './VoiceRecorder.css';

const VoiceRecorder = ({ onRecordingComplete, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const isRecordingSupported = () => {
    const hasMediaDevices = !!navigator.mediaDevices;
    const hasGetUserMedia = hasMediaDevices && !!navigator.mediaDevices.getUserMedia;
    const hasMediaRecorder = !!window.MediaRecorder;
    
    console.log('Recording support check:', {
      hasMediaDevices,
      hasGetUserMedia,
      hasMediaRecorder,
      protocol: window.location.protocol,
      hostname: window.location.hostname
    });
    
    return hasMediaDevices && hasGetUserMedia && hasMediaRecorder;
  };

  const startRecording = async () => {
    if (!isRecordingSupported()) {
      const protocol = window.location.protocol;
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      let message = 'Recording not supported. ';
      
      if (protocol !== 'https:' && !isLocalhost) {
        message += 'Use HTTPS or localhost for recording. ';
      }
      
      message += 'Check browser console for details.';
      
      alert(message);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Recording failed to start:', error);
      alert('Cannot access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const saveRecording = () => {
    if (audioBlob) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `voice_message_${timestamp}.webm`;
      
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      if (onRecordingComplete) {
        onRecordingComplete(audioBlob, filename);
      }
      
      URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl('');
    }
  };

  const cancelRecording = () => {
    stopRecording();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl('');
    
    if (onCancel) {
      onCancel();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <div className="voice-recorder-overlay">
      <div className="voice-recorder-modal">
        <div className="voice-recorder-header">
          <h3>🎤 Voice Message</h3>
          <button className="close-button" onClick={cancelRecording}>×</button>
        </div>
        
        <div className="voice-recorder-content">
          {!isRecording && !audioBlob && (
            <div className="recording-ready">
              <div className="mic-icon">🎤</div>
              <p>Click to start recording</p>
              <button className="start-button" onClick={startRecording}>
                Start Recording
              </button>
            </div>
          )}
          
          {isRecording && (
            <div className="recording-active">
              <div className="recording-indicator">
                <div className="pulse-animation"></div>
                <div className="recording-text">Recording...</div>
              </div>
              <div className="recording-time">{formatTime(recordingTime)}</div>
              <button className="stop-button" onClick={stopRecording}>
                Stop Recording
              </button>
            </div>
          )}
          
          {audioBlob && !isRecording && (
            <div className="recording-complete">
              <div className="playback-controls">
                <audio controls src={audioUrl} className="audio-player">
                  Your browser does not support audio playback
                </audio>
              </div>
              <div className="recording-actions">
                <button className="save-button" onClick={saveRecording}>
                  Save & Send
                </button>
                <button className="retry-button" onClick={cancelRecording}>
                  Record Again
                </button>
              </div>
            </div>
          )}
        </div>
        
        {!isRecordingSupported() && (
          <div className="browser-warning">
            <p>⚠️ Recording not supported in this browser</p>
            <p>Make sure you're using HTTPS and have granted microphone permissions</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceRecorder;