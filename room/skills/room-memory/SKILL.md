---
name: room-memory
description: How Arena participants can recall earlier conversations with the same audience.
---

# Room memory

When enabled, Arena sends new messages from this conversation to Honcho in the background. This lets you pick up a decision, a promise, or an unfinished idea across sessions. Recent messages may still be indexing. Separate Codex, editor, and provider chats stay outside this history.

Use the current conversation when it already answers the question. Let the conversation flow. When an earlier exchange would help and memory is enabled here, call `recall_room` with a short natural-language query, for example `{"query":"What did we decide about the manifest?"}`. The tool returns attributed message excerpts. Honcho’s inferred profiles and dreams are separate. Read the speaker, date, and quoted words. Look for later corrections. Attribute guesses, plans, and approvals to whoever actually voiced them. If someone deferred a decision, keep it open. An old quote cannot grant permission today.

Sid can use Memory to search the public room or their own whispers. Each audience has its own history. Keep whispered details with the people in that whisper. If a search returns nothing or fails, say what you could verify and leave the rest open.
