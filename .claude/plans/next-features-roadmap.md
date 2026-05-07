# English Buddy - Next Features Roadmap

## Context

MVP is live: users register, find partners, make WebRTC voice calls, get AI-powered grammar reports with full transcript. Deployed at english-buddy-web-production.up.railway.app.

**Problem:** MVP proves the concept works. Now need features that create habit loops - reasons to come back daily, track progress, and feel rewarded.

## Phase 1: Retention & Engagement (Week 1-2)

### 1.1 Progress Dashboard
- [ ] Weekly fluency score trend chart (line graph)
- [ ] Total practice minutes this week vs goal
- [ ] Streak counter (consecutive days with a call)
- [ ] "Words learned" counter from Hebrew→English corrections
- [ ] Badge/level system: Beginner (0-5 calls) → Regular (5-20) → Fluent (20+)

**Why:** Users need to SEE improvement. Without visible progress, no motivation to return.

### 1.2 Vocabulary Bank
- [ ] All Hebrew words user struggled with, accumulated across calls
- [ ] Spaced repetition flashcard mode (review every 1/3/7/14 days)
- [ ] Mark words as "learned" to remove from review
- [ ] Daily push notification: "Review 5 words from your calls"

**Why:** Core learning loop. Words from real conversations stick better than textbook vocab.

### 1.3 Practice Reminders & Scheduling
- [ ] Set weekly practice goal (e.g., "3 calls per week")
- [ ] Push notifications: "Sarah is online now, practice for 10 min?"
- [ ] Calendar view showing upcoming availability matches

**Why:** Habit formation requires triggers at the right time.

---

## Phase 2: Better Calls (Week 3-4)

### 2.1 Conversation Topics / Prompts
- [ ] Suggest topic before call starts ("Talk about: your weekend, your job, a movie you watched")
- [ ] Topic difficulty levels matching user's English level
- [ ] "Random topic" button for spontaneous practice
- [ ] Post-call: "Did you enjoy this topic?" → improve matching

**Why:** Awkward silence kills engagement. Topics lower the barrier to start talking.

### 2.2 Real-time Subtitles (Live Transcription)
- [ ] Show live captions during the call using Deepgram/AssemblyAI streaming
- [ ] Partner sees what you said in real-time
- [ ] Highlight Hebrew words as they're spoken
- [ ] Toggle on/off

**Why:** Reduces anxiety. User can confirm they're understood. Partner can read back what was said.

### 2.3 Smart Matching
- [ ] Match by English level (beginners with intermediates, not advanced)
- [ ] Match by interests (topics they enjoy)
- [ ] Match by timezone/availability overlap
- [ ] "Favorite partners" - save people you had good calls with
- [ ] Rating after each call (thumbs up/down)

**Why:** Good partner = good conversation = want to come back. Bad match = frustration = churn.

---

## Phase 3: Social & Gamification (Week 5-6)

### 3.1 Leaderboard & Challenges
- [ ] Weekly leaderboard: most practice minutes
- [ ] Monthly challenge: "Call 10 different partners this month"
- [ ] Achievement badges: "First call", "5 calls streak", "100 words learned"
- [ ] Share achievements to social media

**Why:** Competition drives engagement. Social proof ("12 people practiced today") creates FOMO.

### 3.2 Group Practice Rooms
- [ ] 3-4 person voice rooms around a topic
- [ ] One "discussion leader" with a prompt card
- [ ] Rotate speaking turns (2 min each)
- [ ] Group report comparing all participants

**Why:** Less pressure than 1:1. More fun. Mimics real-world group conversations.

### 3.3 Partner Profiles & Social
- [ ] Bio, interests, what they want to improve
- [ ] "Practice buddy" requests (recurring weekly calls)
- [ ] Chat messaging between calls (text only)
- [ ] See partner's progress/level

**Why:** Relationships = retention. If you have a buddy waiting, you show up.

---

## Phase 4: Monetization (Week 7-8)

### 4.1 Freemium Model
- [ ] Free: 3 calls/week, basic report
- [ ] Pro ($9.99/month): Unlimited calls, detailed reports with transcript, vocabulary bank, streak protection
- [ ] Premium ($19.99/month): Pro + live subtitles, priority matching, AI conversation partner (practice with AI when no humans available)

### 4.2 AI Practice Partner (Solo Mode)
- [ ] Talk to an AI that responds in English
- [ ] AI adjusts difficulty to user's level
- [ ] AI intentionally makes the conversation educational (introduces new vocab)
- [ ] Available 24/7 when no human partners online
- [ ] Uses same analysis pipeline for reports

**Why:** Biggest churn reason: "No one was online when I wanted to practice." AI fills the gap.

---

## Phase 5: Scale & Polish (Week 9+)

### 5.1 Native Mobile App
- [ ] Convert to React Native (reuse most logic)
- [ ] Push notifications for incoming calls
- [ ] Background audio (keep call alive when screen off)
- [ ] App Store / Play Store submission

### 5.2 Multi-language Support
- [ ] Arabic speakers learning English
- [ ] Russian speakers learning English
- [ ] English speakers learning Hebrew/Spanish/etc
- [ ] Dynamic LLM prompt per language pair

### 5.3 Teacher/Tutor Mode
- [ ] Professional tutors can register as "teachers"
- [ ] Paid sessions (user pays per 15-min block)
- [ ] Teacher dashboard with all students' progress
- [ ] Platform takes 20% commission

---

## Recommended Priority (Impact vs Effort)

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Progress Dashboard | 🔥🔥🔥 | Medium | **#1** |
| Vocabulary Bank + Flashcards | 🔥🔥🔥 | Medium | **#2** |
| Conversation Topics | 🔥🔥 | Low | **#3** |
| AI Practice Partner | 🔥🔥🔥 | Medium | **#4** |
| Smart Matching | 🔥🔥 | Medium | **#5** |
| Practice Reminders | 🔥🔥 | Low | **#6** |
| Live Subtitles | 🔥 | High | Later |
| Group Rooms | 🔥🔥 | High | Later |
| Native App | 🔥🔥 | High | Later |

---

## Open Questions
- [ ] Monetization timing - when to introduce paywall? (After 100 users? 1000?)
- [ ] AI practice partner - use GPT-4o realtime voice API or text-to-speech?
- [ ] How to attract first 100 users? (Hebrew Facebook groups? University partnerships?)
- [ ] Should we support video calls or keep audio-only?

## Testing Strategy
- Track daily active users (DAU) and calls per user per week
- A/B test: with vs without conversation topics
- Measure report open rate (do users actually read reports?)
- Track vocabulary review completion rate
- NPS survey after 5th call
