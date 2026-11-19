"""A small client for the ComfyUI server on this PC (standard library only).

ComfyUI runs on Windows at C:\\ComfyUI_windows_portable and listens on 127.0.0.1:8188; this
talks to it from WSL. It was set up by the Eminent Domain project, whose docs/SETUP.md says
how to start it and whose tools/comfy/comfy.py this is cut down from.

The GPU is shared with other work on this PC: `busy()` says whether anything is running or
waiting, and nothing here queues ahead of a job that is.
"""

import json
import os
import shutil
import time
import urllib.error
import urllib.request
import uuid

SERVER = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
COMFY_ROOT = os.environ.get("COMFY_ROOT", "/mnt/c/ComfyUI_windows_portable/ComfyUI")
# everything this project makes is saved under this folder in ComfyUI's output
PREFIX = "xenophon"


def api(path, data=None, timeout=60):
    req = urllib.request.Request(SERVER + path)
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, body, timeout=timeout) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{path} -> HTTP {e.code}: {e.read().decode(errors='replace')[:2000]}") from None


def busy():
    """How many jobs are running or waiting on the server."""
    q = api("/queue")
    return len(q.get("queue_running", [])) + len(q.get("queue_pending", []))


def run(graph, timeout=1800):
    """Queues a graph, waits for it, and returns the files it saved (as WSL paths)."""
    out = api("/prompt", {"prompt": graph, "client_id": uuid.uuid4().hex})
    if out.get("node_errors"):
        raise RuntimeError("node errors: " + json.dumps(out["node_errors"])[:2000])
    job = out["prompt_id"]
    start = time.time()
    while time.time() - start < timeout:
        hist = api("/history/" + job)
        if job in hist:
            entry = hist[job]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError("the job failed: " + json.dumps(status.get("messages", []))[:2000])
            if status.get("completed") or entry.get("outputs"):
                found = []
                for node in entry.get("outputs", {}).values():
                    for items in node.values():
                        if isinstance(items, list):
                            for it in items:
                                if isinstance(it, dict) and "filename" in it:
                                    # ComfyUI on Windows reports nested folders with backslashes
                                    found.append(os.path.join(COMFY_ROOT, "output", it.get("subfolder", "").replace("\\", "/"), it["filename"]))
                return found
        time.sleep(1.5)
    raise TimeoutError(f"job {job} did not finish in {timeout}s")


def txt2img(text, out, seed=1, width=1024, height=1024, control=None, strength=0.8):
    """One picture from Z-Image Turbo (8 steps), copied to `out`.

    `control` is a picture for it to follow (a grey plan of the shape); the result is the
    control picture's size, so both its sides should be multiples of 16.
    """
    name = os.path.splitext(os.path.basename(out))[0]
    graph = {
        "28": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "30": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2", "device": "default"}},
        "29": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "11": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["28", 0], "shift": 3}},
        "27": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["30", 0], "text": text}},
        "33": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["27", 0]}},
        "13": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {
            "model": ["11", 0], "positive": ["27", 0], "negative": ["33", 0], "latent_image": ["13", 0],
            "seed": seed, "steps": 8, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["29", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": f"{PREFIX}/{name}"}},
    }
    if control:
        held = f"{PREFIX}_control_{os.path.basename(control)}"
        shutil.copyfile(control, os.path.join(COMFY_ROOT, "input", held))
        graph["50"] = {"class_type": "LoadImage", "inputs": {"image": held}}
        graph["51"] = {"class_type": "GetImageSize", "inputs": {"image": ["50", 0]}}
        graph["52"] = {"class_type": "ModelPatchLoader", "inputs": {"name": "Z-Image-Turbo-Fun-Controlnet-Union.safetensors"}}
        graph["53"] = {"class_type": "QwenImageDiffsynthControlnet", "inputs": {
            "model": ["28", 0], "model_patch": ["52", 0], "vae": ["29", 0], "image": ["50", 0], "strength": strength}}
        graph["11"]["inputs"]["model"] = ["53", 0]
        graph["13"]["inputs"]["width"] = ["51", 0]
        graph["13"]["inputs"]["height"] = ["51", 1]
    files = run(graph)
    if not files:
        raise RuntimeError("no picture was produced")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    shutil.copyfile(files[0], out)
    return out


def _copy_takes(files, out):
    """Copies what a job saved to `out` (one file), or to out_1, out_2 … (several), keeping their kind."""
    if not files:
        raise RuntimeError("no sound was produced")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    base = os.path.splitext(out)[0]
    written = []
    for i, f in enumerate(sorted(files)):
        dst = (base if len(files) == 1 else f"{base}_{i + 1}") + os.path.splitext(f)[1]
        shutil.copyfile(f, dst)
        written.append(dst)
    return written


def txt2audio(text, out, seconds=3.0, seed=1, takes=1):
    """Sound effects from Stable Audio 3, the small sound-effects model (8 steps), as FLAC.

    The graph is ComfyUI's own template without its prompt-rewriting step (as Eminent Domain's
    tools/comfy/comfy.py has it). The model is tuned for short sounds; the text should end with
    "Length: N seconds". `takes` are made at once, from one seed; returns the files written.
    """
    name = os.path.splitext(os.path.basename(out))[0]
    graph = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "stable_audio_3_small_sfx.safetensors"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "t5gemma_b_b_ul2.safetensors", "type": "stable_audio", "device": "default"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": text}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": ""}},
        "5": {"class_type": "EmptyLatentAudio", "inputs": {"seconds": seconds, "batch_size": takes}},
        "6": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0],
            "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "lcm", "scheduler": "simple", "denoise": 1}},
        "7": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveAudio", "inputs": {"audio": ["7", 0], "filename_prefix": f"{PREFIX}/audio/{name}"}},
    }
    return _copy_takes(run(graph), out)


def txt2music(tags, out, seconds=150.0, seed=1, bpm=80, key="D minor", timesig="4", lyrics="[Instrumental]", plan=True):
    """A piece of music from ACE-Step 1.5 (turbo, 8 steps), as FLAC: ComfyUI's own split-files template.

    `tags` describe it (style, instruments, mood); `lyrics` "[Instrumental]" asks for no voice. Its small
    language model plans the piece first (generate_audio_codes, `plan`), which is slower and said to be better.
    Returns the file.
    """
    name = os.path.splitext(os.path.basename(out))[0]
    graph = {
        "104": {"class_type": "UNETLoader", "inputs": {"unet_name": "acestep_v1.5_turbo.safetensors", "weight_dtype": "default"}},
        "105": {"class_type": "DualCLIPLoader", "inputs": {
            "clip_name1": "qwen_0.6b_ace15.safetensors", "clip_name2": "qwen_1.7b_ace15.safetensors", "type": "ace", "device": "default"}},
        "106": {"class_type": "VAELoader", "inputs": {"vae_name": "ace_1.5_vae.safetensors"}},
        "78": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["104", 0], "shift": 3}},
        "94": {"class_type": "TextEncodeAceStepAudio1.5", "inputs": {
            "clip": ["105", 0], "tags": tags, "lyrics": lyrics, "seed": seed, "bpm": bpm, "duration": seconds,
            "timesignature": timesig, "language": "en", "keyscale": key,
            # (the node's own defaults for its planner, which ComfyUI's API wants given)
            "generate_audio_codes": plan, "cfg_scale": 2.0, "temperature": 0.85, "top_p": 0.9, "top_k": 0, "min_p": 0.0}},
        "47": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["94", 0]}},
        "98": {"class_type": "EmptyAceStep1.5LatentAudio", "inputs": {"seconds": seconds, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {
            "model": ["78", 0], "positive": ["94", 0], "negative": ["47", 0], "latent_image": ["98", 0],
            "seed": seed, "steps": 8, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1}},
        "18": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["3", 0], "vae": ["106", 0]}},
        "107": {"class_type": "SaveAudio", "inputs": {"audio": ["18", 0], "filename_prefix": f"{PREFIX}/music/{name}"}},
    }
    return _copy_takes(run(graph, timeout=3600), out)[0]
