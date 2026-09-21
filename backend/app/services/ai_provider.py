"""
AI provider abstraction. Pluggable backends via env:
  AI_PROVIDER=mock | openai | anthropic
  AI_API_KEY=...
  AI_MODEL=gpt-4o-mini (optional)

The 'mock' provider works with zero setup — it generates
deterministic template-based MCQs so you can demo the feature
to colleges even without an AI key.
"""
import os
import json
import random
from typing import List, Dict, Any, Optional

def _env(k: str, d: str = "") -> str:
    return os.getenv(k, d)

SYSTEM_PROMPT = """You are an expert exam-question author for a university.
Generate single-choice MCQs. Respond ONLY with a JSON array.
Each item: {"text": str, "options": [{"text": str, "is_correct": bool} x4], "explanation": str, "topic": str, "difficulty": "easy"|"medium"|"hard"}
Exactly one option must have is_correct=true. No markdown, no prose."""

def generate_questions(
    subject: str,
    topics: List[str],
    count: int,
    difficulty_mix: Optional[Dict[str, float]] = None,
    learning_objectives: str = "",
    source_material: str = "",
) -> List[Dict[str, Any]]:
    """Return a list of normalized question dicts."""
    provider = _env("AI_PROVIDER", "mock").lower()
    api_key = _env("AI_API_KEY", "")
    model = _env("AI_MODEL", "gpt-4o-mini")

    if provider == "mock" or not api_key:
        return _mock_generate(subject, topics, count, difficulty_mix)
    if provider == "openai":
        return _openai_generate(subject, topics, count, difficulty_mix, learning_objectives, source_material, api_key, model)
    if provider == "anthropic":
        return _anthropic_generate(subject, topics, count, difficulty_mix, learning_objectives, source_material, api_key, model)
    return _mock_generate(subject, topics, count, difficulty_mix)


def _user_prompt(subject, topics, count, difficulty_mix, learning_objectives, source_material) -> str:
    mix = difficulty_mix or {"easy": 0.4, "medium": 0.4, "hard": 0.2}
    mix_lines = "\n".join(f"  - {k}: {int(v*100)}%" for k, v in mix.items())
    return f"""Subject: {subject}
Topics: {', '.join(topics) if topics else 'any relevant'}
Number of questions: {count}
Difficulty distribution:
{mix_lines}
Learning objectives: {learning_objectives or 'N/A'}
Source material (optional): {source_material[:6000] or 'N/A'}

Generate {count} MCQs."""


def _normalize(raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for q in raw:
        opts = q.get("options") or []
        if len(opts) < 2:
            continue
        # ensure exactly one correct
        correct_count = sum(1 for o in opts if o.get("is_correct"))
        if correct_count != 1:
            # fallback: mark first correct
            for i, o in enumerate(opts):
                o["is_correct"] = (i == 0)
        out.append({
            "text": str(q.get("text", "")).strip(),
            "options": [{"text": str(o.get("text", "")).strip(), "is_correct": bool(o.get("is_correct"))} for o in opts],
            "explanation": str(q.get("explanation", "")).strip(),
            "topic": q.get("topic") or "General",
            "difficulty": q.get("difficulty") if q.get("difficulty") in ("easy", "medium", "hard") else "medium",
        })
    return out


def _mock_generate(subject, topics, count, difficulty_mix) -> List[Dict[str, Any]]:
    """Template-based generator. Real enough to demo."""
    mix = difficulty_mix or {"easy": 0.4, "medium": 0.4, "hard": 0.2}
    diffs = []
    for d, w in mix.items():
        diffs += [d] * max(1, int(round(w * count)))
    while len(diffs) < count:
        diffs.append("medium")
    diffs = diffs[:count]

    topic_list = topics or [subject or "General"]
    templates = [
        ("Which of the following best describes {topic}?",
         ["A fundamental concept in {subject}",
          "An unrelated term",
          "A deprecated technique",
          "A hardware component"]),
        ("In {subject}, what is the primary purpose of {topic}?",
         ["To solve domain-specific problems efficiently",
          "To increase file size",
          "To reduce network latency only",
          "To replace all algorithms"]),
        ("Which statement about {topic} is TRUE?",
         ["It has well-defined properties and use cases",
          "It cannot be applied in practice",
          "It is only theoretical",
          "It was removed from {subject}"]),
        ("Select the correct application of {topic} in {subject}:",
         ["Real-world problem solving",
          "Only for printing output",
          "Only for memory cleanup",
          "None of the above"]),
        ("What is a key characteristic of {topic}?",
         ["Consistency and predictability",
          "Randomness",
          "Unbounded growth",
          "Deprecation"]),
    ]

    out = []
    for i in range(count):
        topic = random.choice(topic_list)
        diff = diffs[i]
        tpl_q, tpl_opts = random.choice(templates)
        q_text = tpl_q.format(topic=topic, subject=subject)
        opts = []
        for j, o in enumerate(tpl_opts):
            opts.append({"text": o.format(topic=topic, subject=subject), "is_correct": (j == 0)})
        random.shuffle(opts)
        out.append({
            "text": q_text,
            "options": opts,
            "explanation": f"{topic} is a key topic in {subject}. The correct choice reflects its standard definition and use.",
            "topic": topic,
            "difficulty": diff,
        })
    return out


def _openai_generate(subject, topics, count, difficulty_mix, learning_objectives, source_material, api_key: str, model: str):
    try:
        from openai import OpenAI
    except ImportError:
        return _mock_generate(subject, topics, count, difficulty_mix)
    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(subject, topics, count, difficulty_mix, learning_objectives, source_material)},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and "questions" in data:
            data = data["questions"]
    except Exception:
        data = []
    return _normalize(data)


def _anthropic_generate(subject, topics, count, difficulty_mix, learning_objectives, source_material, api_key: str, model: str):
    try:
        import anthropic
    except ImportError:
        return _mock_generate(subject, topics, count, difficulty_mix)
    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model=model if model.startswith("claude") else "claude-3-5-sonnet-latest",
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _user_prompt(subject, topics, count, difficulty_mix, learning_objectives, source_material)}],
    )
    text = msg.content[0].text
    try:
        start = text.find("[")
        end = text.rfind("]") + 1
        data = json.loads(text[start:end])
    except Exception:
        data = []
    return _normalize(data)
