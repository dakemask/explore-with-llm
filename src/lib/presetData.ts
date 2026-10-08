import type { ModelPreset } from './presets'

/**
 * Researched from the vendors' official API docs (2026-10). Only official channels. Parameter names are
 * shown in the composer as-is.
 */
export const PRESET_DATA: ModelPreset[] = [
  {
    "id": "openai-chat/deepseek-flash",
    "protocol": "openai-chat",
    "vendor": "DeepSeek",
    "label": "DeepSeek V4.1 Flash",
    "series": "DeepSeek",
    "params": [
      {
        "name": "思考",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "EFFORT"
          }
        },
        "options": [
          "enabled",
          "disabled"
        ],
        "default": "enabled",
        "help": "关闭后不思考，直接回答。"
      },
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "low",
          "high",
          "max"
        ],
        "default": "high",
        "requires": {
          "思考": "enabled"
        },
        "help": "思考的深度。low 最快最省，max 想得最多。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1024,
        "max": 393216,
        "step": 1024,
        "default": 393216,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值：不思考 8K，思考 64K，max 强度 128K。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1M 上下文，最大输出 384K。旧名 deepseek-v4-flash 目前也会转到这个模型。"
  },
  {
    "id": "openai-chat/deepseek-v4-pro",
    "protocol": "openai-chat",
    "vendor": "DeepSeek",
    "label": "DeepSeek V4 Pro",
    "series": "DeepSeek",
    "params": [
      {
        "name": "思考",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "EFFORT"
          }
        },
        "options": [
          "enabled",
          "disabled"
        ],
        "default": "enabled",
        "help": "关闭后不思考，直接回答。"
      },
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "low",
          "high",
          "max"
        ],
        "default": "high",
        "requires": {
          "思考": "enabled"
        },
        "help": "思考的深度。low 最快最省，max 想得最多。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1024,
        "max": 393216,
        "step": 1024,
        "default": 393216,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值：不思考 8K，思考 64K，max 强度 128K。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1M 上下文，最大输出 384K，不支持图片。"
  },
  {
    "id": "openai-chat/gpt-5.6-sol",
    "protocol": "openai-chat",
    "vendor": "OpenAI",
    "label": "GPT-5.6 Sol",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "verbosity": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_completion_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1.05M 上下文，最大输出 128K。别名 gpt-5.6 指向此模型。Chat Completions 不返回思考内容，也无法回传；需要思考摘要、Pro 模式时请用 Responses 协议。"
  },
  {
    "id": "openai-chat/gpt-5.6-terra",
    "protocol": "openai-chat",
    "vendor": "OpenAI",
    "label": "GPT-5.6 Terra",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "verbosity": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_completion_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1.05M 上下文，最大输出 128K。Chat Completions 不返回思考内容，也无法回传；需要思考摘要、Pro 模式时请用 Responses 协议。"
  },
  {
    "id": "openai-chat/gpt-5.6-luna",
    "protocol": "openai-chat",
    "vendor": "OpenAI",
    "label": "GPT-5.6 Luna",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "verbosity": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_completion_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1.05M 上下文，最大输出 128K。Chat Completions 不返回思考内容，也无法回传；需要思考摘要、Pro 模式时请用 Responses 协议。"
  },
  {
    "id": "openai-chat/gpt-6-astra",
    "protocol": "openai-chat",
    "vendor": "OpenAI",
    "label": "GPT-6 Astra",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度，max 想得最多。这个模型不能关闭思考（没有 none）。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "verbosity": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_completion_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1.05M 上下文，最大输出 128K。Chat Completions 不返回思考内容，也无法回传；需要思考摘要、Pro 模式时请用 Responses 协议。"
  },
  {
    "id": "openai-chat/gpt-6.1-sol",
    "protocol": "openai-chat",
    "vendor": "OpenAI",
    "label": "GPT-6.1 Sol",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度，max 想得最多。这个模型不能关闭思考（没有 none）。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "verbosity": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_completion_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1.05M 上下文，最大输出 128K。Chat Completions 不返回思考内容，也无法回传；需要思考摘要、Pro 模式时请用 Responses 协议。"
  },
  {
    "id": "openai-chat/gpt-6-sol",
    "protocol": "openai-chat",
    "vendor": "OpenAI",
    "label": "GPT-6 Sol",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "verbosity": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_completion_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1.05M 上下文，最大输出 128K。已有更新的 GPT-6.1 Sol。Chat Completions 不返回思考内容，也无法回传；需要思考摘要、Pro 模式时请用 Responses 协议。"
  },
  {
    "id": "openai-chat/gpt-6-luna",
    "protocol": "openai-chat",
    "vendor": "OpenAI",
    "label": "GPT-6 Luna",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning_effort": "EFFORT"
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "verbosity": "EFFORT"
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_completion_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "stream_options": {
            "include_usage": true
          }
        }
      }
    ],
    "echoReasoning": false,
    "notes": "1.05M 上下文，最大输出 128K。Chat Completions 不返回思考内容，也无法回传；需要思考摘要、Pro 模式时请用 Responses 协议。"
  },
  {
    "id": "openai-responses/gpt-5.6-sol",
    "protocol": "openai-responses",
    "vendor": "OpenAI",
    "label": "GPT-5.6 Sol",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "思考摘要",
        "type": "fixed",
        "body": {
          "reasoning": {
            "summary": "auto"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "返回思考过程的摘要，可在对话里查看。关闭后不返回思考内容。"
      },
      {
        "name": "Pro 模式",
        "type": "fixed",
        "body": {
          "reasoning": {
            "mode": "pro"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "更慢、更耗 token，适合最难的问题。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "text": {
            "verbosity": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_output_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "store": false,
          "include": [
            "reasoning.encrypted_content"
          ]
        }
      }
    ],
    "echoReasoning": true,
    "notes": "1.05M 上下文，最大输出 128K。别名 gpt-5.6 指向此模型。以无状态方式调用（store:false），加密思考随上下文回传。"
  },
  {
    "id": "openai-responses/gpt-5.6-terra",
    "protocol": "openai-responses",
    "vendor": "OpenAI",
    "label": "GPT-5.6 Terra",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "思考摘要",
        "type": "fixed",
        "body": {
          "reasoning": {
            "summary": "auto"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "返回思考过程的摘要，可在对话里查看。关闭后不返回思考内容。"
      },
      {
        "name": "Pro 模式",
        "type": "fixed",
        "body": {
          "reasoning": {
            "mode": "pro"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "更慢、更耗 token，适合最难的问题。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "text": {
            "verbosity": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_output_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "store": false,
          "include": [
            "reasoning.encrypted_content"
          ]
        }
      }
    ],
    "echoReasoning": true,
    "notes": "1.05M 上下文，最大输出 128K。以无状态方式调用（store:false），加密思考随上下文回传。"
  },
  {
    "id": "openai-responses/gpt-5.6-luna",
    "protocol": "openai-responses",
    "vendor": "OpenAI",
    "label": "GPT-5.6 Luna",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "思考摘要",
        "type": "fixed",
        "body": {
          "reasoning": {
            "summary": "auto"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "返回思考过程的摘要，可在对话里查看。关闭后不返回思考内容。"
      },
      {
        "name": "Pro 模式",
        "type": "fixed",
        "body": {
          "reasoning": {
            "mode": "pro"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "更慢、更耗 token，适合最难的问题。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "text": {
            "verbosity": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_output_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "store": false,
          "include": [
            "reasoning.encrypted_content"
          ]
        }
      }
    ],
    "echoReasoning": true,
    "notes": "1.05M 上下文，最大输出 128K。以无状态方式调用（store:false），加密思考随上下文回传。"
  },
  {
    "id": "openai-responses/gpt-6-astra",
    "protocol": "openai-responses",
    "vendor": "OpenAI",
    "label": "GPT-6 Astra",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度，max 想得最多。这个模型不能关闭思考（没有 none）。"
      },
      {
        "name": "思考摘要",
        "type": "fixed",
        "body": {
          "reasoning": {
            "summary": "auto"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "help": "返回思考过程的摘要，可在对话里查看。关闭后不返回思考内容。"
      },
      {
        "name": "Pro 模式",
        "type": "fixed",
        "body": {
          "reasoning": {
            "mode": "pro"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "help": "更慢、更耗 token，适合最难的问题。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "text": {
            "verbosity": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_output_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "store": false,
          "include": [
            "reasoning.encrypted_content"
          ]
        }
      }
    ],
    "echoReasoning": true,
    "notes": "1.05M 上下文，最大输出 128K。以无状态方式调用（store:false），加密思考随上下文回传。"
  },
  {
    "id": "openai-responses/gpt-6.1-sol",
    "protocol": "openai-responses",
    "vendor": "OpenAI",
    "label": "GPT-6.1 Sol",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度，max 想得最多。这个模型不能关闭思考（没有 none）。"
      },
      {
        "name": "思考摘要",
        "type": "fixed",
        "body": {
          "reasoning": {
            "summary": "auto"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "help": "返回思考过程的摘要，可在对话里查看。关闭后不返回思考内容。"
      },
      {
        "name": "Pro 模式",
        "type": "fixed",
        "body": {
          "reasoning": {
            "mode": "pro"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "help": "更慢、更耗 token，适合最难的问题。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "text": {
            "verbosity": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_output_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "store": false,
          "include": [
            "reasoning.encrypted_content"
          ]
        }
      }
    ],
    "echoReasoning": true,
    "notes": "1.05M 上下文，最大输出 128K。以无状态方式调用（store:false），加密思考随上下文回传。"
  },
  {
    "id": "openai-responses/gpt-6-sol",
    "protocol": "openai-responses",
    "vendor": "OpenAI",
    "label": "GPT-6 Sol",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "思考摘要",
        "type": "fixed",
        "body": {
          "reasoning": {
            "summary": "auto"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "返回思考过程的摘要，可在对话里查看。关闭后不返回思考内容。"
      },
      {
        "name": "Pro 模式",
        "type": "fixed",
        "body": {
          "reasoning": {
            "mode": "pro"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "更慢、更耗 token，适合最难的问题。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "text": {
            "verbosity": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_output_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "store": false,
          "include": [
            "reasoning.encrypted_content"
          ]
        }
      }
    ],
    "echoReasoning": true,
    "notes": "1.05M 上下文，最大输出 128K。已有更新的 GPT-6.1 Sol。以无状态方式调用（store:false），加密思考随上下文回传。"
  },
  {
    "id": "openai-responses/gpt-6-luna",
    "protocol": "openai-responses",
    "vendor": "OpenAI",
    "label": "GPT-6 Luna",
    "series": "GPT",
    "params": [
      {
        "name": "思考强度",
        "type": "choice",
        "body": {
          "reasoning": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "思考的深度。none 不思考，max 想得最多。"
      },
      {
        "name": "思考摘要",
        "type": "fixed",
        "body": {
          "reasoning": {
            "summary": "auto"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "返回思考过程的摘要，可在对话里查看。关闭后不返回思考内容。"
      },
      {
        "name": "Pro 模式",
        "type": "fixed",
        "body": {
          "reasoning": {
            "mode": "pro"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "requires": {
          "思考强度": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ]
        },
        "help": "更慢、更耗 token，适合最难的问题。"
      },
      {
        "name": "详细程度",
        "type": "choice",
        "body": {
          "text": {
            "verbosity": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high"
        ],
        "default": "medium",
        "help": "回复正文写得多详细。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_output_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "toggle": true,
        "defaultOn": true,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。关闭则用接口默认值。"
      },
      {
        "type": "silent",
        "body": {
          "store": false,
          "include": [
            "reasoning.encrypted_content"
          ]
        }
      }
    ],
    "echoReasoning": true,
    "notes": "1.05M 上下文，最大输出 128K。以无状态方式调用（store:false），加密思考随上下文回传。"
  },
  {
    "id": "anthropic/claude-fable-5-1",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Fable 5.1",
    "series": "Claude",
    "params": [
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "adaptive",
            "display": "EFFORT",
            "block_binding": {
              "prefix_mismatch_behavior": "drop_block"
            }
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "headers": "anthropic-beta: thinking-binding-controls-2026-08-01",
    "notes": "1M 上下文，最大输出 128K。思考始终开启（自适应）。历史中的思考块若校验不通过，接口会丢掉它们照常回答，而不是报错（需要附带的 beta 头）。"
  },
  {
    "id": "anthropic/claude-opus-5-5",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Opus 5.5",
    "series": "Claude",
    "params": [
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "medium",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "adaptive",
            "display": "EFFORT",
            "block_binding": {
              "prefix_mismatch_behavior": "drop_block"
            }
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "headers": "anthropic-beta: thinking-binding-controls-2026-08-01",
    "notes": "1M 上下文，最大输出 128K。思考始终开启（自适应）。历史中的思考块若校验不通过，接口会丢掉它们照常回答，而不是报错（需要附带的 beta 头）。"
  },
  {
    "id": "anthropic/claude-sonnet-5-5",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Sonnet 5.5",
    "series": "Claude",
    "params": [
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。关闭思考时也有效。"
      },
      {
        "name": "关闭思考",
        "type": "fixed",
        "body": {
          "thinking": {
            "type": "between_tools"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "requires": {
          "投入程度": [
            "low",
            "medium",
            "high"
          ]
        },
        "help": "回答前不思考（发送 between_tools）。只能在投入程度 high 及以下使用。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "adaptive",
            "display": "EFFORT",
            "block_binding": {
              "prefix_mismatch_behavior": "drop_block"
            }
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "requires": {
          "关闭思考": false
        },
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "headers": "anthropic-beta: thinking-binding-controls-2026-08-01",
    "notes": "1M 上下文，最大输出 128K。默认思考（自适应），可以关闭前置思考。历史中的思考块若校验不通过，接口会丢掉它们照常回答，而不是报错（需要附带的 beta 头）。"
  },
  {
    "id": "anthropic/claude-fable-5",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Fable 5",
    "series": "Claude",
    "params": [
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "adaptive",
            "display": "EFFORT"
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "notes": "1M 上下文，最大输出 128K。思考始终开启（自适应）。已有更新的 Fable 5.1。"
  },
  {
    "id": "anthropic/claude-opus-5",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Opus 5",
    "series": "Claude",
    "params": [
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。关闭思考时也有效。"
      },
      {
        "name": "关闭思考",
        "type": "fixed",
        "body": {
          "thinking": {
            "type": "disabled"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "requires": {
          "投入程度": [
            "low",
            "medium",
            "high"
          ]
        },
        "help": "回答前不思考。只能在投入程度 high 及以下使用。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "adaptive",
            "display": "EFFORT"
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "requires": {
          "关闭思考": false
        },
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "notes": "1M 上下文，最大输出 128K。默认思考（自适应），可以关闭。"
  },
  {
    "id": "anthropic/claude-sonnet-5",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Sonnet 5",
    "series": "Claude",
    "params": [
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。关闭思考时也有效。"
      },
      {
        "name": "关闭思考",
        "type": "fixed",
        "body": {
          "thinking": {
            "type": "disabled"
          }
        },
        "toggle": true,
        "defaultOn": false,
        "help": "回答前不思考。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "type": "adaptive",
            "display": "EFFORT"
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "requires": {
          "关闭思考": false
        },
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "notes": "1M 上下文，最大输出 128K。默认思考（自适应），可以关闭。"
  },
  {
    "id": "anthropic/claude-opus-4-8",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Opus 4.8",
    "series": "Claude",
    "params": [
      {
        "name": "思考",
        "type": "fixed",
        "body": {
          "thinking": {
            "type": "adaptive"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "help": "自适应思考：模型自己决定要不要想、想多深。接口默认不思考，这里默认打开。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "display": "EFFORT"
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "requires": {
          "思考": true
        },
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。关闭思考时也有效。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "notes": "1M 上下文，最大输出 128K。"
  },
  {
    "id": "anthropic/claude-opus-4-7",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Opus 4.7",
    "series": "Claude",
    "params": [
      {
        "name": "思考",
        "type": "fixed",
        "body": {
          "thinking": {
            "type": "adaptive"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "help": "自适应思考：模型自己决定要不要想、想多深。接口默认不思考，这里默认打开。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "display": "EFFORT"
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "requires": {
          "思考": true
        },
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。关闭思考时也有效。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "notes": "1M 上下文，最大输出 128K。"
  },
  {
    "id": "anthropic/claude-opus-4-6",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Opus 4.6",
    "series": "Claude",
    "params": [
      {
        "name": "思考",
        "type": "fixed",
        "body": {
          "thinking": {
            "type": "adaptive"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "help": "自适应思考：模型自己决定要不要想、想多深。接口默认不思考，这里默认打开。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "display": "EFFORT"
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "requires": {
          "思考": true
        },
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。关闭思考时也有效。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "notes": "1M 上下文，最大输出 128K。"
  },
  {
    "id": "anthropic/claude-sonnet-4-6",
    "protocol": "anthropic",
    "vendor": "Anthropic",
    "label": "Claude Sonnet 4.6",
    "series": "Claude",
    "params": [
      {
        "name": "思考",
        "type": "fixed",
        "body": {
          "thinking": {
            "type": "adaptive"
          }
        },
        "toggle": true,
        "defaultOn": true,
        "help": "自适应思考：模型自己决定要不要想、想多深。接口默认不思考，这里默认打开。"
      },
      {
        "name": "思考显示",
        "type": "choice",
        "body": {
          "thinking": {
            "display": "EFFORT"
          }
        },
        "options": [
          "summarized",
          "omitted"
        ],
        "default": "summarized",
        "requires": {
          "思考": true
        },
        "help": "summarized：返回思考摘要，可在对话里查看。\nomitted：不返回思考内容，正文出得更快。"
      },
      {
        "name": "投入程度",
        "type": "choice",
        "body": {
          "output_config": {
            "effort": "EFFORT"
          }
        },
        "options": [
          "low",
          "medium",
          "high",
          "max"
        ],
        "default": "high",
        "help": "整个回复（思考和正文）愿意花多少力气。low 最快最省，max 最充分。关闭思考时也有效。"
      },
      {
        "name": "最大输出",
        "type": "range",
        "body": {
          "max_tokens": "VALUE"
        },
        "min": 1000,
        "max": 128000,
        "step": 1000,
        "default": 128000,
        "help": "回复（含思考）最多生成多少 token。只是上限，按实际生成计费。Anthropic 官方接口要求必须发送。"
      }
    ],
    "echoReasoning": true,
    "notes": "1M 上下文，最大输出 128K。"
  }
]
