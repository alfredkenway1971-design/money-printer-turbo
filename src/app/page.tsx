import { VideoGenerator } from '@/components/VideoGenerator';

export const metadata = {
  title: 'Money Printer Turbo — AI Video Generator',
  description: 'Generate short-form videos from any topic using AI',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      <div className="container mx-auto px-4 py-8 sm:py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-4xl sm:text-6xl font-bold text-white mb-4">
            💸 Money Printer Turbo
          </h1>
          <p className="text-base sm:text-xl text-purple-200">
            Generate professional short-form videos from any topic — automatically
          </p>
        </div>

        {/* Main Generator Component */}
        <VideoGenerator />

        {/* Features Section */}
        <div className="mt-16 sm:mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <FeatureCard
            icon="📝"
            title="AI Script Writing"
            description="Generate engaging scripts tailored for short-form video platforms"
          />
          <FeatureCard
            icon="🎨"
            title="AI Image Generation"
            description="Create stunning visuals that match your script content"
          />
          <FeatureCard
            icon="🎬"
            title="Auto Video Assembly"
            description="Combine everything into polished videos with transitions and effects"
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-purple-500/20 hover:border-purple-400/40 transition-all">
      <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">{icon}</div>
      <h3 className="text-base sm:text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm sm:text-purple-200">{description}</p>
    </div>
  );
}
