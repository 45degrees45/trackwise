"""
ollama_client.py — Sends a prompt to local Ollama and returns the response text.
Model-agnostic. Falls back gracefully if Ollama isn't running.
"""

import json
import requests


def query_ollama(prompt, model, ollama_url, timeout=120):
    """
    Sends prompt to Ollama /api/generate endpoint.

    Returns: (response_text, error_string)
    One of them will be None.
    """
    endpoint = ollama_url.rstrip('/') + '/api/generate'

    payload = {
        'model':  model,
        'prompt': prompt,
        'stream': False,
        'options': {
            'temperature': 0.4,   # Low temp — we want consistent, focused output
            'num_predict': 300,   # Enough for reasoning + 4-line output
        }
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        return data.get('response', '').strip(), None

    except requests.exceptions.ConnectionError:
        return None, (
            f"Ollama not running at {ollama_url}.\n"
            "Start it with: ollama serve\n"
            "Showing rule-based output instead."
        )
    except requests.exceptions.Timeout:
        return None, f"Ollama timed out after {timeout}s. Showing rule-based output instead."
    except requests.exceptions.HTTPError as e:
        # 404 usually means model not pulled yet
        if e.response.status_code == 404:
            return None, (
                f"Model '{model}' not found.\n"
                f"Pull it with: ollama pull {model}\n"
                "Showing rule-based output instead."
            )
        return None, f"Ollama HTTP error: {e}"
    except Exception as e:
        return None, f"Unexpected error querying Ollama: {e}"


def check_ollama_running(ollama_url):
    """Returns True if Ollama is accessible."""
    try:
        requests.get(ollama_url.rstrip('/') + '/api/tags', timeout=3)
        return True
    except Exception:
        return False
