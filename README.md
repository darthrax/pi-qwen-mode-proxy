# pi-qwen-mode-proxy

Sampling mode proxy extension for [pi](https://pi.dev) that intercepts OpenAI-completions API requests to a llama.cpp server and injects mode-specific sampling parameters for Qwen models (tested with Qwen 3.6 27B). Parameters taken from the recommendation note on model page (https://huggingface.co/Qwen/Qwen3.6-27B).

## Modes

| Parameter | 🧠 Thinking | 💻 Coding | 📝 Instruct |
|-----------|:-----------:|:---------:|:-----------:|
| temperature | 1.0 | 0.6 | 0.7 |
| top_p | 0.95 | 0.95 | 0.80 |
| top_k | 20 | 20 | 20 |
| min_p | 0.0 | 0.0 | 0.0 |
| presence_penalty | 0.0 | 0.0 | 1.5 |
| repetition_penalty | 1.0 | 1.0 | 1.0 |

- **Thinking** — Creative, exploratory tasks. High temperature for diverse output.
- **Coding** — Precise, deterministic coding tasks. Lower temperature for consistent results.
- **Instruct** — Instruction-following with presence penalty to encourage topic variety.

## Installation

### npm

```bash
pi install npm:pi-qwen-mode-proxy
```

### git

```bash
pi install git:github.com/YOUR_USERNAME/pi-qwen-mode-proxy
```

### local

```bash
pi install /path/to/pi-qwen-mode-proxy
```

## Usage

Requires a llama.cpp server serving a Qwen model, registered as the `llamacpp` provider in `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "llamacpp": {
      "baseUrl": "http://10.10.10.11:8080/v1",
      "api": "openai-completions",
      "apiKey": "llamacpp",
      "compat": {
        "supportsDeveloperRole": true,
        "supportsReasoningEffort": true,
        "thinkingFormat": "qwen-chat-template"
      },
      "models": [
        {
          "id": "llamacpp",
          "name": "(Local AI)",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 131072,
          "maxTokens": 16384,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

### Commands

```
/mode              Show current mode and parameters
/mode thinking     Switch to thinking mode
/mode coding       Switch to coding mode
/mode instruct     Switch to instruct mode
```

The current mode is displayed in the status bar footer and persists across `/reload` via session storage.

## How It Works

The extension hooks into pi's `before_provider_request` event, which fires after pi builds the OpenAI chat completions payload but before it's sent over the network. When the target model is `llamacpp`, the handler injects the six sampling parameters (`temperature`, `top_p`, `top_k`, `min_p`, `presence_penalty`, `repetition_penalty`) corresponding to the active mode.

No custom provider or streaming implementation is needed — the extension works as a lightweight interceptor on top of pi's built-in `openai-completions` provider.

## Configuration

The model ID filter defaults to `llamacpp`. If your provider/model uses a different ID, edit `extensions/index.ts` and change the `TARGET_MODEL` constant.

## License

MIT
