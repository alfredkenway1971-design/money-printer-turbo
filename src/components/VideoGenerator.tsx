'use client';

import { useState, useRef, useCallback } from 'react';

interface Scene {
  segment: string;
  url: string;
}

export function VideoGenerator() {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState('openrouter/auto');

  // Client-side TTS using Web Speech API (no server binaries needed!)
  const generateAudioClientSide = useCallback(async (text: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Web Speech API not supported in this browser'));
        return;
      }

      // Create audio context to capture speech synthesis output
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const destination = audioContext.createMediaStreamDestination();
      
      // Create MediaRecorder to capture audio
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        audioContext.close();
        resolve(blob);
      };

      mediaRecorder.start();

      // Use SpeechSynthesis to speak the text
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => {
        setTimeout(() => mediaRecorder.stop(), 500);
      };

      utterance.onerror = (e) => {
        mediaRecorder.stop();
        audioContext.close();
        reject(new Error('Speech synthesis error: ' + e.error));
      };

      speechSynthesis.speak(utterance);
    });
  }, []);

  // Client-side video assembly using Canvas + MediaRecorder (no ffmpeg needed!)
  const generateVideoClientSide = useCallback(async (scenes: Scene[], audioBlob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      // Load images
      const loadImages = scenes.map((scene) => {
        return new Promise<HTMLImageElement>((resolve, imgReject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => imgReject(new Error('Image load failed'));
          img.src = scene.url;
        });
      });

      Promise.all(loadImages)
        .then((images) => {
          const sceneDuration = 5000; // 5 seconds per scene
          const fadeDuration = 800; // 0.8 seconds fade
          const totalDuration = scenes.length * sceneDuration;

          // Create canvas stream at 30fps
          const canvasStream = canvas.captureStream(30);

          // Create audio context and connect audio blob
          const audioContext = new AudioContext();
          const audioSource = audioContext.createMediaStreamSource(
            new MediaStream([audioBlob])
          );
          audioSource.connect(audioContext.destination);

          // Combine video and audio streams
          const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioContext.destination.stream.getAudioTracks()
          ]);

          // Record with MediaRecorder
          const mediaRecorder = new MediaRecorder(combinedStream, {
            mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
              ? 'video/webm;codecs=vp9,opus'
              : 'video/webm'
          });

          const chunks: Blob[] = [];
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          mediaRecorder.onstop = () => {
            const videoBlob = new Blob(chunks, { type: 'video/webm' });
            const videoUrl = URL.createObjectURL(videoBlob);
            resolve(videoUrl);
          };

          mediaRecorder.start();

          // Draw scenes with crossfade transitions
          const drawFrame = () => {
            const elapsed = performance.now();
            const currentSceneIndex = Math.floor(elapsed / sceneDuration);
            const sceneTime = elapsed % sceneDuration;

            if (currentSceneIndex >= scenes.length) {
              mediaRecorder.stop();
              audioContext.close();
              return;
            }

            // Clear canvas
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw image with fade-in effect
            const img = images[currentSceneIndex];
            const fadeProgress = Math.min(sceneTime / fadeDuration, 1);
            
            ctx.globalAlpha = fadeProgress;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;

            // Draw scene text overlay
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 28px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(
              scenes[currentSceneIndex].segment,
              canvas.width / 2,
              canvas.height - 40
            );

            requestAnimationFrame(drawFrame);
          };

          drawFrame();

          // Stop recording after total duration
          setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
              audioContext.close();
            }
          }, totalDuration + 1000);
        })
        .catch(reject);
    });
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    
    setIsLoading(true);
    setError('');
    setScript('');
    setScenes([]);
    setVideoUrl('');

    try {
      // Step 1: Generate script (server-side, no binaries needed)
      setCurrentStep('📝 Generating script...');
      const scriptRes = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });

      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptData.error || 'Failed to generate script');
      
      setScript(scriptData.script);
      setCurrentStep('🎨 Generating images...');

      // Split script into segments
      const segments = scriptData.script
        .split(/[.!?]\n|[.!?]/)
        .filter((s: string) => s.trim().length > 10);

      // Step 2: Generate images (server-side, no binaries needed)
      const imagesRes = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptSegments: segments, count: Math.min(5, segments.length) })
      });

      const imageData = await imagesRes.json();
      if (!imagesRes.ok) throw new Error(imageData.error || 'Failed to generate images');
      
      setScenes(imageData.images);
      setCurrentStep('🎵 Generating voiceover (browser)...');

      // Step 3: Generate audio (CLIENT-SIDE using Web Speech API - no server binaries!)
      const audioBlob = await generateAudioClientSide(scriptData.script);
      setCurrentStep('🎬 Assembling video (browser)...');

      // Step 4: Assemble video (CLIENT-SIDE using Canvas + MediaRecorder - no ffmpeg!)
      const finalVideoUrl = await generateVideoClientSide(imageData.images, audioBlob);
      setVideoUrl(finalVideoUrl);
      setCurrentStep('✅ Complete! Your video is ready.');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setCurrentStep('❌ Error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = 'money-printer-turbo-video.webm';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-8 border border-purple-500/30 shadow-2xl">
      {/* Input Section */}
      <div className="mb-6 sm:mb-8">
        <label className="block text-lg font-semibold text-white mb-3">
          Enter your video topic:
        </label>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., 'The future of renewable energy'"
            className="flex-1 px-4 py-3 bg-white/10 border border-purple-500/30 rounded-lg 
                      text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !topic.trim()}
            className="px-6 sm:px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold
                      rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isLoading ? 'Generating...' : '🚀 Generate'}
          </button>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-white/10 border border-purple-500/30 rounded-lg 
                    text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="openrouter/auto">OpenRouter Auto (Best Value)</option>
          <option value="google/gemini-3.8-flash">Google Gemini 3.8 Flash</option>
          <option value="qwen/qwen3.8-max-0902">Qwen 3.8 Max</option>
          <option value="deepseek/deepseek-v4-flash-vision-exp">DeepSeek V4 Flash</option>
          <option value="openai/gpt-6-astra">OpenAI GPT-6 Astra</option>
        </select>
      </div>

      {/* Progress Indicator */}
      {currentStep && (
        <div className="mb-6 p-4 bg-black/30 rounded-lg border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full ${
              currentStep.includes('✅') ? 'bg-green-500' :
              currentStep.includes('❌') ? 'bg-red-500' :
              'animate-pulse bg-purple-500'
            }`} />
            <span className="text-white font-medium">{currentStep}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/40 rounded-lg">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {/* Generated Script */}
      {script && (
        <div className="mb-8">
          <h3 className="text-xl font-bold text-white mb-3">Generated Script:</h3>
          <div className="p-4 bg-black/30 rounded-lg border border-purple-500/20">
            <p className="text-purple-100 leading-relaxed whitespace-pre-wrap">{script}</p>
          </div>
        </div>
      )}

      {/* Scenes Grid */}
      {scenes.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-bold text-white mb-3">Generated Scenes:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {scenes.map((scene, idx) => (
              <div key={idx} className="bg-black/30 rounded-lg overflow-hidden border border-purple-500/20">
                <img
                  src={scene.url}
                  alt={`Scene ${idx + 1}`}
                  className="w-full h-32 sm:h-48 object-cover"
                />
                <div className="p-2 sm:p-3">
                  <p className="text-xs sm:text-sm text-purple-200 line-clamp-2">{scene.segment}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Video */}
      {videoUrl && (
        <div className="mb-8">
          <h3 className="text-xl font-bold text-white mb-3">Final Video:</h3>
          <video controls className="w-full rounded-lg shadow-lg border border-purple-500/30 aspect-video">
            <source src={videoUrl} type="video/webm" />
            Your browser does not support the video tag.
          </video>
          <button
            onClick={handleDownload}
            className="mt-4 inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors w-full sm:w-auto text-center"
          >
            ⬇️ Download Video (.webm)
          </button>
        </div>
      )}
    </div>
  );
}
