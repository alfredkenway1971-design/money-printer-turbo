'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Scene {
  segment: string;
  url?: string;
  filepath?: string;
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

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    
    setIsLoading(true);
    setError('');
    setScript('');
    setScenes([]);
    setVideoUrl('');

    try {
      // Step 1: Generate script
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

      // Split script into segments for each scene
      const segments = scriptData.script
        .split(/[.!?]\n|[.!?]/)
        .filter((s: string) => s.trim().length > 10);

      // Step 2: Generate images
      const imagesRes = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptSegments: segments, count: Math.min(5, segments.length) })
      });

      const imageData = await imagesRes.json();
      if (!imagesRes.ok) throw new Error(imageData.error || 'Failed to generate images');
      
      setScenes(imageData.images);
      setCurrentStep('🎵 Generating audio...');

      // Step 3: Generate audio (voiceover)
      const audioRes = await fetch('/api/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: scriptData.script })
      });

      const audioData = await audioRes.json();
      if (!audioRes.ok) throw new Error(audioData.error || 'Failed to generate audio');

      setCurrentStep('🎬 Assembling video...');

      // Step 4: Assemble final video
      const videoRes = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          images: imageData.images,
          script: scriptData.script,
          audioPath: audioData.filepath 
        })
      });

      const videoData = await videoRes.json();
      if (!videoRes.ok) throw new Error(videoData.error || 'Failed to assemble video');

      setVideoUrl(videoData.url);
      setCurrentStep('✅ Complete! Your video is ready.');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setCurrentStep('❌ Error occurred');
    } finally {
      setIsLoading(false);
    }
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
                {scene.url ? (
                  <Image
                    src={scene.url}
                    alt={`Scene ${idx + 1}`}
                    width={320}
                    height={180}
                    className="w-full h-32 sm:h-48 object-cover"
                  />
                ) : (
                  <div className="w-full h-32 sm:h-48 bg-gradient-to-br from-purple-900 to-slate-800 flex items-center justify-center">
                    <span className="text-5xl sm:text-6xl">🎬</span>
                  </div>
                )}
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
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <a
            href={videoUrl}
            download
            className="mt-4 inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors w-full sm:w-auto text-center"
          >
            ⬇️ Download Video
          </a>
        </div>
      )}
    </div>
  );
}
