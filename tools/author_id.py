#!/usr/bin/env python3
"""Author_ID — local anime artist style recognition (方案 A).

Usage:
  python tools/author_id.py path/to/image.png
  python tools/author_id.py path/to/image.png --top 10

Deps:
  pip install onnxruntime onnx pillow numpy huggingface_hub
  # GPU: pip install onnxruntime-gpu ...
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image

REPO_ID = "AugustLabs/Author_ID"
MODEL_FILE = "style_predictor_500.onnx"


class AuthorID:
    """Single ONNX file: model + centroids + author names."""

    def __init__(self, onnx_path: str | Path) -> None:
        onnx_path = str(onnx_path)
        model_onnx = onnx.load(onnx_path)
        self.names: list[str] = []
        self.input_size = 384

        for prop in model_onnx.metadata_props:
            if prop.key == "author_names":
                self.names = json.loads(prop.value)
            elif prop.key == "input_size":
                self.input_size = int(prop.value)

        if not self.names:
            raise RuntimeError("ONNX metadata missing author_names")

        available = ort.get_available_providers()
        providers = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in available]
        self.session = ort.InferenceSession(onnx_path, providers=providers or available)
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)

    def preprocess(self, image_path: str | Path) -> np.ndarray:
        img = Image.open(image_path)

        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[3])
            img = bg
        else:
            img = img.convert("RGB")

        resample = getattr(Image, "Resampling", Image).BILINEAR
        img = img.resize((self.input_size, self.input_size), resample)
        img_np = np.array(img, dtype=np.float32) / 255.0
        img_np = img_np.transpose(2, 0, 1)[np.newaxis, ...]
        return (img_np - self.mean) / self.std

    def predict(self, image_path: str | Path, top_k: int = 5) -> list[tuple[str, float]]:
        img_np = self.preprocess(image_path)
        top_indices, top_scores = self.session.run(None, {"image": img_np})
        results: list[tuple[str, float]] = []
        for idx, score in zip(top_indices[0][:top_k], top_scores[0][:top_k]):
            results.append((self.names[int(idx)], float(score)))
        return results


def ensure_model() -> Path:
    return Path(
        hf_hub_download(repo_id=REPO_ID, filename=MODEL_FILE),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Author_ID artist style recognition")
    parser.add_argument("image", type=Path, help="Path to illustration image")
    parser.add_argument("--top", type=int, default=5, help="Top-K artists (default 5)")
    parser.add_argument(
        "--model",
        type=Path,
        default=None,
        help="Local ONNX path (default: download from HuggingFace)",
    )
    args = parser.parse_args(argv)

    if not args.image.is_file():
        print(f"Image not found: {args.image}", file=sys.stderr)
        return 1

    model_path = args.model if args.model else ensure_model()
    print(f"Model: {model_path}")
    print(f"Providers: {ort.get_available_providers()}")

    model = AuthorID(model_path)
    results = model.predict(args.image, top_k=args.top)

    print(f"\nImage: {args.image}")
    print("Top artist styles:")
    for name, score in results:
        print(f"  {name}: {score:.1%}")

    tags = ", ".join(f"(artist:{name}:{score:.2f})" for name, score in results)
    print(f"\nTags: {tags}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
