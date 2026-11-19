import { Camera } from 'lucide-react';
import { useState } from 'react';

interface BeachPhotoProps {
  src?: string;
  alt: string;
  className?: string;
}

export function BeachPhoto({ src, alt, className = 'h-48 w-full' }: BeachPhotoProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-gradient-to-br from-sky-50 via-slate-50 to-amber-50 text-[#475569]`}
        role="img"
        aria-label={alt}
      >
        <Camera className="h-6 w-6 text-[#0284C7]" aria-hidden="true" />
        <span className="text-xs font-medium">Imagem indisponível</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} rounded-xl border border-[#E2E8F0] object-cover bg-slate-100`}
      loading="lazy"
    />
  );
}
