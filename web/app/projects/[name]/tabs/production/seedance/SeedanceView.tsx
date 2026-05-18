'use client';
import DirectorSection from './DirectorSection';
import ArtDesignSection from './ArtDesignSection';
import StoryboardPrompts from './StoryboardPrompts';

interface SeedanceViewProps {
  encodedName: string;
  episode: number;
  assets: { type: string; name: string; path: string; mode: string }[];
  activeStep: number;
}

export default function SeedanceView({ encodedName, episode, assets, activeStep }: SeedanceViewProps) {
  return (
    <div className="space-y-4">
      {activeStep === 0 && (
        <DirectorSection encodedName={encodedName} episode={episode} />
      )}
      {activeStep === 1 && (
        <ArtDesignSection encodedName={encodedName} assets={assets} />
      )}
      {activeStep === 2 && (
        <StoryboardPrompts encodedName={encodedName} episode={episode} assets={assets} />
      )}
    </div>
  );
}
