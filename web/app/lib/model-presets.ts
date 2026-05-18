import type { ModelConfig } from '@/app/lib/novels';

export type ImageAdapter = 'openai-images' | 'grsai-task-polling' | 'custom-http';
export type ImagePlatformId = '' | 'openai' | 'grsai' | 'custom';
export type ImageModelPresetId = 'openai-gpt-image-2' | 'grsai-gpt-image-2' | 'grsai-nano-banana';

export interface ImageModelPreset {
  id: ImageModelPresetId;
  label: string;
  providerLabel: string;
  adapterLabel: string;
  config: ModelConfig;
}

const GRSAI_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '3:2',
  '2:3',
  '16:9',
  '9:16',
  '5:4',
  '4:5',
  '4:3',
  '3:4',
  '21:9',
  '9:21',
  '1:3',
  '3:1',
  '2:1',
  '1:2',
];

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GRSAI_COMPLETIONS_URL = 'https://grsai.dakka.com.cn/v1/draw/completions';
const GRSAI_NANO_BANANA_URL = 'https://grsai.dakka.com.cn/v1/draw/nano-banana';
const GRSAI_POLL_URL = 'https://grsai.dakka.com.cn/v1/draw/result';
const OPENAI_SIZE_OPTIONS = ['auto', '1024x1024', '1536x1024', '1024x1536'];
const OPENAI_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'];
const OPENAI_OUTPUT_FORMATS = ['png', 'webp', 'jpeg'];

export const IMAGE_MODEL_PRESETS: ImageModelPreset[] = [
  {
    id: 'openai-gpt-image-2',
    label: 'OpenAI gpt-image-2',
    providerLabel: '官方 OpenAI',
    adapterLabel: 'OpenAI Images API',
    config: {
      modelId: 'openai-gpt-image-2',
      name: 'OpenAI gpt-image-2',
      type: 'image',
      mode: 'text_to_image',
      provider: 'openai',
      adapter: 'openai-images',
      enabled: true,
      api: {
        baseUrl: OPENAI_BASE_URL,
        apiKey: '',
        method: 'POST',
      },
      defaultParams: {
        model: 'gpt-image-2',
        size: '1024x1024',
        quality: 'auto',
        output_format: 'png',
      },
      capabilities: {
        sizeOptions: OPENAI_SIZE_OPTIONS,
        qualityOptions: OPENAI_QUALITY_OPTIONS,
        outputFormats: OPENAI_OUTPUT_FORMATS,
        supportsReferenceImages: false,
        sizeParam: 'size',
      },
    },
  },
  {
    id: 'grsai-gpt-image-2',
    label: 'GRSAI gpt-image-2',
    providerLabel: '第三方 GRSAI',
    adapterLabel: 'GRSAI 任务轮询',
    config: {
      modelId: 'grsai-gpt-image-2',
      name: 'GRSAI gpt-image-2',
      type: 'image',
      mode: 'text_to_image',
      provider: 'grsai',
      adapter: 'grsai-task-polling',
      enabled: true,
      api: {
        submitUrl: GRSAI_COMPLETIONS_URL,
        pollUrl: GRSAI_POLL_URL,
        apiKey: '',
        method: 'POST',
      },
      defaultParams: {
        model: 'gpt-image-2',
        aspectRatio: '1:1',
        webHook: '-1',
        shutProgress: false,
      },
      capabilities: {
        aspectRatios: GRSAI_ASPECT_RATIOS,
        supportsReferenceImages: true,
        sizeOptions: [],
        sizeParam: null,
      },
    },
  },
  {
    id: 'grsai-nano-banana',
    label: 'GRSAI Nano Banana',
    providerLabel: '第三方 GRSAI',
    adapterLabel: 'GRSAI 任务轮询',
    config: {
      modelId: 'nano-banana',
      name: 'Nano Banana 图像生成',
      type: 'image',
      mode: 'text_to_image',
      provider: 'grsai',
      adapter: 'grsai-task-polling',
      enabled: true,
      api: {
        submitUrl: GRSAI_NANO_BANANA_URL,
        pollUrl: GRSAI_POLL_URL,
        apiKey: '',
        method: 'POST',
      },
      defaultParams: {
        model: 'nano-banana-2',
        imageSize: '2K',
        aspectRatio: '16:9',
        webHook: '-1',
        shutProgress: false,
      },
      capabilities: {
        aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        supportsReferenceImages: true,
        sizeOptions: ['1K', '2K', '4K'],
        sizeParam: 'imageSize',
      },
    },
  },
];

export function cloneModelConfig(config: ModelConfig): ModelConfig {
  return JSON.parse(JSON.stringify(config)) as ModelConfig;
}

export function createBlankImageModelDraft(): ModelConfig {
  return {
    modelId: '',
    name: '',
    type: 'image',
    mode: 'text_to_image',
    provider: '',
    enabled: true,
    api: {
      apiKey: '',
      method: 'POST',
    },
    defaultParams: {},
    capabilities: {},
  };
}

export function createImageModelDraft(presetId: ImageModelPresetId): ModelConfig {
  const preset = IMAGE_MODEL_PRESETS.find((item) => item.id === presetId) || IMAGE_MODEL_PRESETS[1];
  return cloneModelConfig(preset.config);
}

export function inferImagePlatform(config: ModelConfig): ImagePlatformId {
  const provider = String(config.provider || '').toLowerCase();
  if (provider === 'openai' || provider === 'grsai' || provider === 'custom') return provider;
  if (config.adapter === 'openai-images' || config.api?.baseUrl?.includes('openai.com')) return 'openai';
  if (config.adapter === 'grsai-task-polling' || (config.api?.submitUrl && config.api?.pollUrl)) return 'grsai';
  if (config.adapter === 'custom-http' || config.api?.baseUrl || config.api?.submitUrl) return 'custom';
  return '';
}

export function getImageModelSuggestion(platform: ImagePlatformId, remoteModel: string): { modelId: string; name: string } | null {
  if (platform === 'openai' && remoteModel === 'gpt-image-2') {
    return { modelId: 'openai-gpt-image-2', name: 'OpenAI gpt-image-2' };
  }
  if (platform === 'grsai' && remoteModel === 'gpt-image-2') {
    return { modelId: 'grsai-gpt-image-2', name: 'GRSAI gpt-image-2' };
  }
  if (platform === 'grsai' && remoteModel === 'nano-banana-2') {
    return { modelId: 'grsai-nano-banana', name: 'Nano Banana 图像生成' };
  }
  return null;
}

export function isSystemSuggestedImageIdentity(config: ModelConfig): boolean {
  const suggestions = [
    getImageModelSuggestion('openai', 'gpt-image-2'),
    getImageModelSuggestion('grsai', 'gpt-image-2'),
    getImageModelSuggestion('grsai', 'nano-banana-2'),
  ].filter(Boolean) as Array<{ modelId: string; name: string }>;

  const modelId = config.modelId.trim();
  const name = config.name.trim();
  return (
    (!modelId || suggestions.some((item) => item.modelId === modelId)) &&
    (!name || suggestions.some((item) => item.name === name))
  );
}

export function applyImagePlatform(config: ModelConfig, platform: ImagePlatformId): ModelConfig {
  const apiKey = config.api?.apiKey || '';
  const base: ModelConfig = {
    ...config,
    type: 'image',
    mode: 'text_to_image',
    provider: platform,
    adapter: undefined,
    enabled: config.enabled ?? true,
    api: {
      apiKey,
      method: 'POST',
    },
    defaultParams: {},
    capabilities: {},
  };

  if (platform === 'openai') {
    return {
      ...base,
      adapter: 'openai-images',
      api: {
        ...base.api,
        baseUrl: OPENAI_BASE_URL,
      },
      defaultParams: {
        size: '1024x1024',
        quality: 'auto',
        output_format: 'png',
      },
      capabilities: {
        sizeOptions: OPENAI_SIZE_OPTIONS,
        qualityOptions: OPENAI_QUALITY_OPTIONS,
        outputFormats: OPENAI_OUTPUT_FORMATS,
        supportsReferenceImages: false,
        sizeParam: 'size',
      },
    };
  }

  if (platform === 'grsai') {
    return {
      ...base,
      adapter: 'grsai-task-polling',
      api: {
        ...base.api,
        submitUrl: GRSAI_COMPLETIONS_URL,
        pollUrl: GRSAI_POLL_URL,
      },
      defaultParams: {
        aspectRatio: '1:1',
        webHook: '-1',
        shutProgress: false,
      },
      capabilities: {
        aspectRatios: GRSAI_ASPECT_RATIOS,
        supportsReferenceImages: true,
        sizeOptions: [],
        sizeParam: null,
      },
    };
  }

  if (platform === 'custom') {
    return {
      ...base,
      adapter: 'custom-http',
      provider: 'custom',
    };
  }

  return base;
}

export function applyRemoteImageModel(
  config: ModelConfig,
  remoteModel: string,
  options: { forceIdentity?: boolean } = {},
): ModelConfig {
  const platform = inferImagePlatform(config);
  const defaultParams: Record<string, unknown> = { ...(config.defaultParams || {}), model: remoteModel };
  let next: ModelConfig = {
    ...config,
    defaultParams,
  };

  if (platform === 'openai') {
    next = {
      ...next,
      api: {
        ...(next.api || {}),
        baseUrl: next.api?.baseUrl || OPENAI_BASE_URL,
        method: next.api?.method || 'POST',
      },
      defaultParams: {
        ...defaultParams,
        size: defaultParams.size || '1024x1024',
        quality: defaultParams.quality || 'auto',
        output_format: defaultParams.output_format || 'png',
      },
      capabilities: {
        sizeOptions: OPENAI_SIZE_OPTIONS,
        qualityOptions: OPENAI_QUALITY_OPTIONS,
        outputFormats: OPENAI_OUTPUT_FORMATS,
        supportsReferenceImages: false,
        sizeParam: 'size',
      },
    };
  }

  if (platform === 'grsai' && remoteModel === 'nano-banana-2') {
    next = {
      ...next,
      api: {
        ...(next.api || {}),
        submitUrl: GRSAI_NANO_BANANA_URL,
        pollUrl: next.api?.pollUrl || GRSAI_POLL_URL,
        method: next.api?.method || 'POST',
      },
      defaultParams: {
        ...defaultParams,
        aspectRatio: defaultParams.aspectRatio || '16:9',
        imageSize: defaultParams.imageSize || defaultParams.size || '2K',
        webHook: defaultParams.webHook || '-1',
        shutProgress: Boolean(defaultParams.shutProgress),
      },
      capabilities: {
        aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        supportsReferenceImages: true,
        sizeOptions: ['1K', '2K', '4K'],
        sizeParam: 'imageSize',
      },
    };
  } else if (platform === 'grsai') {
    next = {
      ...next,
      api: {
        ...(next.api || {}),
        submitUrl: GRSAI_COMPLETIONS_URL,
        pollUrl: next.api?.pollUrl || GRSAI_POLL_URL,
        method: next.api?.method || 'POST',
      },
      defaultParams: {
        ...defaultParams,
        aspectRatio: defaultParams.aspectRatio || '1:1',
        webHook: defaultParams.webHook || '-1',
        shutProgress: Boolean(defaultParams.shutProgress),
      },
      capabilities: {
        aspectRatios: GRSAI_ASPECT_RATIOS,
        supportsReferenceImages: true,
        sizeOptions: [],
        sizeParam: null,
      },
    };
  }

  const suggestion = getImageModelSuggestion(platform, remoteModel);
  if (suggestion && (options.forceIdentity || isSystemSuggestedImageIdentity(config))) {
    next = {
      ...next,
      modelId: suggestion.modelId,
      name: suggestion.name,
    };
  }

  return next;
}

export function inferImageAdapter(config: ModelConfig): ImageAdapter {
  if (config.adapter === 'openai-images' || config.adapter === 'grsai-task-polling' || config.adapter === 'custom-http') {
    return config.adapter;
  }
  if (config.provider === 'openai' || config.api?.baseUrl?.includes('openai.com')) return 'openai-images';
  if (config.api?.submitUrl && config.api?.pollUrl) return 'grsai-task-polling';
  return 'custom-http';
}

export function inferImagePresetId(config: ModelConfig): ImageModelPresetId | 'custom' {
  const adapter = inferImageAdapter(config);
  const submitUrl = config.api?.submitUrl || '';
  const remoteModel = String(config.defaultParams?.model || '');
  if (adapter === 'openai-images' && remoteModel === 'gpt-image-2') return 'openai-gpt-image-2';
  if (adapter === 'grsai-task-polling' && submitUrl.includes('/v1/draw/completions')) return 'grsai-gpt-image-2';
  if (adapter === 'grsai-task-polling' && submitUrl.includes('/v1/draw/nano-banana')) return 'grsai-nano-banana';
  return 'custom';
}

export function getImageProviderLabel(config: ModelConfig): string {
  const provider = String(config.provider || '').toLowerCase();
  if (provider === 'openai') return '官方 OpenAI';
  if (provider === 'grsai') return '第三方 GRSAI';
  if (provider === 'custom') return '自定义 HTTP';
  return provider ? provider : '待选择';
}

export function getImageAdapterLabel(config: ModelConfig): string {
  if (!config.adapter && !config.api?.baseUrl && !config.api?.submitUrl) return '待选择';
  const adapter = inferImageAdapter(config);
  if (adapter === 'openai-images') return 'OpenAI Images API';
  if (adapter === 'grsai-task-polling') return 'GRSAI 任务轮询';
  return '自定义 HTTP';
}
