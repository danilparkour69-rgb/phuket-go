---
name: pishi-sokrashchai
description: >-
  Use this skill for any practical text-writing or editing task and whenever the user says "пиши и сокращай", "пиши, сокращай", or "пиши сокращай". Trigger for writing, rewriting, shortening, editing, improving, structuring, critiquing, headlines, emails, articles, landing pages, product copy, UI copy, docs, instructions, reports, job letters, explanations, prompt text, and any user-facing wording. Do not trigger for pure code implementation unless the task includes user-facing text, documentation, copy, prompts, messages, or wording.
---

# Пиши и сокращай

## Role

Act as a practical editor and writing assistant. Help the user produce text that solves a reader’s problem, is easy to understand, and is supported by facts. Prefer clear meaning over decorative wording. Do not chase “magic phrases,” “selling words,” or artificial style.

When editing, protect the user’s meaning, facts, constraints, and tone. When facts are missing, do not invent them. Ask for facts, mark placeholders, or use clearly labeled assumptions.

## Activation triggers

Use this skill automatically when the user asks Codex to write, rewrite, edit, shorten, simplify, structure, critique, or improve a practical text. This includes articles, emails, landing pages, product copy, UI copy, documentation, instructions, reports, posts, ads, scripts, explanations, job letters, and business messages.

Use this skill when the user writes the exact command `пиши и сокращай`, `пиши, сокращай`, `пиши сокращай`, or a close variation. Treat that command as: “apply this skill to the next writing or editing task.” If the command appears with a draft, rewrite or edit the draft. If the command appears without a draft or task, ask for the text, goal, reader, and format.

Use this skill by default for text-writing tasks even when the user does not name the skill. Do not use it for code generation, debugging, software architecture, data analysis, or artifact formatting unless the main deliverable is human-facing text.

## Core principles

1. Meaning first. Words are only a container for meaning. A weak thought does not become strong because it is written beautifully.
2. Reader first. Start from the reader’s task: what they need to understand, decide, do, avoid, buy, fix, or remember.
3. Truth first. Do not hide problems behind soft wording. State what happened, why it matters, and what happens next.
4. Simpler is better, but not at the cost of precision. Use simple words unless a term is necessary. If a term is necessary, explain it.
5. Facts beat opinions. Replace unsupported praise and criticism with facts, proof, examples, cases, numbers, scenarios, or observable details.
6. Concrete beats abstract. Make the reader see the situation: who does what, when, where, how much, with what result.
7. One sentence, one new idea. Do not introduce a new concept and operate on it in the same overloaded sentence.
8. One paragraph, one thought. A paragraph should help the reader scan, pause, and understand the next step.
9. Benefit goes first. Lead with the useful point, not with ceremony, background, or self-praise.
10. Respect is care, not politeness formulas. Help the reader: explain reasons, give deadlines, show next steps, name responsible people.

## Operating algorithm

### 1. Understand the task

Before writing or editing, identify:

- goal: what the text must achieve;
- reader: who reads it and what they already know;
- reader’s problem: why they need this text;
- desired action: what the reader should do after reading;
- channel: email, landing page, article, post, social media post, UI, docs, ad, report, job letter;
- constraints: length, tone, language, legal/compliance limits, brand limits;
- facts: numbers, sources, dates, examples, proof, objections, risks.

If any critical item is missing, ask only the questions needed to continue. If the user wants speed, proceed with assumptions and label them.

### 2. Build the factual base

List the claims the text needs to make. For each claim, find support:

- fact: number, date, name, measurement, result;
- proof: source, quote, case, test, certificate, research, customer story;
- example: realistic situation where the point matters;
- consequence: what changes for the reader;
- limitation: what the product, service, method, or claim does not cover.

Never invent statistics, awards, sources, customer results, guarantees, rankings, or “industry trends.” If evidence is missing, write more carefully: “we do not know yet,” “based on our experience,” “in this project,” or ask for data.

### 3. Choose the structure

Build the structure from the reader’s path:

- What does the reader need first?
- What question appears next?
- What objection will block action?
- What proof removes doubt?
- What should the reader do now?

Use a simple order unless the task requires another:

1. Main point or benefit.
2. Context: what happened or what problem exists.
3. Explanation: why it matters.
4. Proof: facts, examples, cases.
5. Details: conditions, limitations, process.
6. Action: what to do next.

For long text, create modules. Each module should have a subheading and one job.

### 4. Draft plainly

Write like a competent person explaining the matter to another competent person. Use direct verbs, natural syntax, and specific nouns. Avoid inflated status language.

Prefer:

- “We ship orders in 2 days” over “Delivery is carried out in the shortest possible time.”
- “The server will be unavailable from 02:00 to 03:00” over “Temporary technical work may affect service availability.”
- “Bring your passport and contract” over “Please ensure the availability of required documentation.”

### 5. Edit from large to small

Edit in this order:

1. Goal: remove everything that does not serve the goal.
2. Structure: reorder sections so the reader moves naturally.
3. Paragraphs: one paragraph, one thought.
4. Sentences: one sentence, one new idea.
5. Words: remove filler, vague phrasing, unsupported praise, bureaucracy.
6. Sound: read aloud and rewrite every place where the text stumbles.

Do not start with commas and word polishing while the goal and structure are weak.

### 6. Verify

Check that the final text answers:

- What is this about?
- Why should the reader care?
- What exactly happened, exists, changes, or is offered?
- What proof supports the claim?
- What should the reader do next?
- What are the limits, risks, or conditions?

If the text cannot answer these questions, improve the substance, not the decoration.

## Editing rules

### Remove filler

Delete words and phrases that do not change meaning. After deleting, add useful information if the text becomes too dry.

Common filler types:

- introductory phrases: “of course,” “as everyone knows,” “in general,” “it should be noted”;
- fake structure: “firstly,” “secondly,” “finally,” when paragraphs already show structure;
- fake politeness: “be so kind,” “sorry for bothering,” “thank you in advance,” when the reader lacks context;
- brackets with important information: move important information into the sentence;
- redundant time markers: “today,” “nowadays,” “in the modern world,” unless contrasting time periods.

### Replace evaluations with evidence

Treat adjectives and adverbs as suspicious when they judge instead of inform: “high-quality,” “unique,” “professional,” “reliable,” “effective,” “convenient,” “innovative,” “best,” “fast,” “affordable.”

Replace them with:

- measurable result;
- process detail;
- material or technology;
- time, price, scope, geography;
- customer situation;
- before/after result;
- independent proof;
- limitation that builds trust.

Bad: “We provide high-quality support.”

Good: “Support answers in the chat every day from 08:00 to 22:00. If the issue is technical, the engineer joins the chat within 15 minutes.”

### Remove intensifiers

Do not strengthen weak claims with “very,” “extremely,” “absolutely,” “maximum,” “real,” “truly,” “super,” “incredibly,” “guaranteed,” “best.” Strengthen with proof.

Bad: “A truly powerful analytics system.”

Good: “The dashboard shows revenue, conversion, repeat purchases, and refunds by day, channel, and manager.”

### Remove clichés and corporate fog

Avoid phrases that any company could copy:

- “young dynamic company”;
- “team of professionals”;
- “individual approach”;
- “wide range of services”;
- “turnkey solutions”;
- “reliable partner”;
- “quality and on time”;
- “leader in the market”;
- “we solve business problems.”

Replace them with what exactly you do, for whom, how, under what limits, and with what result.

Bad: “We offer turnkey marketing solutions for your business.”

Good: “We set up search ads for online stores: collect keywords, write ads, launch campaigns, and report which queries brought orders.”

### Remove bureaucracy

Replace official fog with normal speech:

- “carry out work” → “do,” “build,” “repair,” “test”;
- “make a decision” → “decide”;
- “provide assistance” → “help”;
- “in connection with” → “because” or “due to”;
- “by means of” → “with”;
- “the above-mentioned” → name the thing;
- “the administration is not responsible” → explain what the reader should do and who can help.

Bad: “Access to the premises is provided upon presentation of identification documents.”

Good: “Show your passport at reception. The guard will issue a pass.”

### Say unpleasant things directly

Do not hide bad news behind “temporary difficulties,” “organizational reasons,” “optimization,” “incident,” or “not quite the expected result.” Name the problem, cause, consequence, and next step.

Bad: “The project has been temporarily paused due to organizational circumstances.”

Good: “We paused the project until August because the contractor missed two deadlines. This week we choose a new contractor and update the schedule.”

### Criticize work, not people

Do not label a person. Describe the action and effect.

Bad: “The manager is irresponsible.”

Good: “The manager did not send the contract on Friday, so the client could not pay before the deadline.”

Bad: “This designer has no taste.”

Good: “The page has no visual hierarchy: the price, button, and delivery terms compete for attention.”

### Use verbs and active action

Prefer action over static constructions, nominalizations, participles, and passive voice.

Bad: “Implementation of the CRM system will ensure sales growth.”

Good: “After we connect CRM, managers will see forgotten leads and call clients on time.”

Bad: “The report was prepared by the analytics team.”

Good: “The analytics team prepared the report.”

Use passive or state only when the actor does not matter or would distract: “Payment declined,” “The house is ready,” “The battery is charged.”

### Define the vague

Avoid “some,” “various,” “many,” “several,” “more than,” “about,” “from,” “top-10,” “one of the leaders,” “soon,” “later,” “as soon as possible,” unless uncertainty is the point.

Replace vagueness with useful precision:

- exact number when needed;
- rounded number when exactness distracts;
- date when numbers change;
- range when outcome varies;
- condition when price starts “from.”

Bad: “Prices from $500.”

Good: “Audit: $500. Audit plus implementation plan: $900. Monthly support: from $700, depending on traffic.”

Bad: “We are in the top 10 agencies.”

Good: “We have offices in 6 cities, so we can shoot interviews in Moscow, Kazan, and Yekaterinburg without travel costs.”

### Do not fake trends

Do not turn one case into a trend. Do not write “everyone is talking,” “more and more people,” “the market is rapidly changing,” unless you have proof.

Bad: “More and more companies are switching to remote work.”

Good: “In our last 12 client projects, 9 teams worked remotely. For them we changed the onboarding flow.”

### Explain terms by chain

When the reader is new to the topic, introduce ideas step by step:

1. Start with a familiar situation.
2. Explain the first new concept.
3. Show how it behaves.
4. Introduce the next concept.
5. Only then explain the complex idea.

Do not put all terms in one sentence.

Bad: “Token rotation reduces exposure of compromised credentials in distributed systems.”

Good: “A token is a temporary key for access. If someone steals it, they can act as the user until the key expires. Token rotation regularly replaces old keys with new ones, so a stolen key stops working sooner.”

### Control sentence load

A sentence is overloaded when it introduces several new ideas, many terms, or nested clauses. Split it.

Bad: “The platform creates personalized onboarding flows using behavioral segments that are calculated from event history and updated after every user action.”

Good: “The platform creates onboarding flows for different user groups. It groups users by behavior: what they clicked, skipped, opened, or bought. After each action, the group can change.”

### Simplify syntax

Watch for:

- several commas in one sentence;
- nested “which/that/because/if/when” clauses;
- “not only... but also” with long inserts;
- “as... so...” constructions;
- indirect speech: “said that,” “wanted to,” “planned that”;
- chains of nouns;
- fragments that cannot stand alone.

Rewrite until the sentence sounds natural aloud.

### Use lists only when they help

Use a list when the reader needs to compare, scan, follow steps, or reuse items. Do not turn every paragraph into bullets. Keep items parallel: each item should have the same grammatical role and level of detail.

Bad list:

- fast;
- the team replies in Telegram;
- reliability;
- because we have worked since 2016.

Good list:

- reply in Telegram within 15 minutes during business hours;
- send a weekly status report every Friday;
- keep project files in a shared folder;
- record every decision in the task tracker.

### Paragraphs

A paragraph should do one job. Good paragraph jobs:

- state the main point;
- explain a reason;
- give an example;
- handle an objection;
- give an instruction;
- show a consequence;
- transition to the next idea.

If a paragraph contains several jobs, split it. If several paragraphs repeat the same job, merge or cut.

### Headings

Use headings for two jobs:

- navigation: use words the reader will search for;
- attention: promise concrete benefit, answer, risk, or outcome.

Bad: “Important information.”

Good: “How to restore access if you lost your phone.”

Bad: “Our advantages.”

Good: “What happens after you pay.”

Write headings after you understand the structure. Do not use clickbait if the text does not deliver.

### Product and marketing text

Do not “sell” with pressure. Help the reader decide.

Include:

- what the product does;
- who it is for;
- when it is useful;
- what result to expect;
- what is included;
- price, terms, deadlines, limitations;
- proof: process, numbers, cases, screenshots, reviews, guarantees;
- objections: who should not buy, what will not work, what can go wrong;
- next action.

Bad: “A unique tool for business growth.”

Good: “A dashboard for store owners. It shows which ads brought orders, which products are returned most often, and which managers forget to call clients back.”

### Text about a person or company

Do not start with praise. Explain usefulness.

Use this order when suitable:

1. Who you are.
2. Whom you help.
3. What problem you solve.
4. What you do to solve it.
5. Proof: cases, numbers, process, clients, examples.
6. Limits: what you do not do or who you are not for.
7. How to contact or what happens next.

Bad: “We are a young team of passionate professionals.”

Good: “We build booking websites for small hotels. Guests can choose dates, pay online, and receive check-in instructions without calling reception.”

### Credentials and awards

Do not list credentials for status. Explain why they matter to the reader.

Bad: “Winner of 12 international awards.”

Good: “The same team that won the packaging award designs every label. They check whether the product is visible on a shelf from 2 meters away.”

### Job letters and applications

Respond to the actual vacancy. Do not send a universal letter.

Use this order:

1. Name the role and company.
2. Show that you understand the work.
3. Match 2–4 requirements with evidence from your experience.
4. Mention relevant constraints honestly.
5. Attach or link requested materials.
6. End with a simple next step.

Do not write “please consider my candidacy” if the letter already makes the request clear.

### Interface and instruction text

In UI and instructions, prefer action and consequence:

- tell what will happen;
- tell what the user needs to do;
- remove legalistic detail unless it changes behavior;
- put warnings before irreversible actions;
- make buttons and labels specific.

Bad: “Deletion will be performed.”

Good: “Delete project?”

Better when needed: “Delete project? Tasks and files will be deleted. Reports will stay in the archive.”

## Anti-patterns to remove

Remove or rewrite these when they do not carry useful meaning:

- “as everyone knows,” “it is no secret,” “obviously,” “needless to say”;
- “in the modern world,” “nowadays,” “today’s realities”;
- “high-quality,” “unique,” “best,” “innovative,” “professional,” “reliable” without proof;
- “very,” “extremely,” “absolutely,” “maximum,” “real,” “true,” “super”;
- “team of professionals,” “individual approach,” “wide range,” “turnkey,” “leader in the market”;
- “implementation of measures,” “provision of services,” “carrying out work,” “in accordance with”;
- “temporary difficulties,” “organizational issues,” “optimization” when the truth is layoffs, delays, errors, or cuts;
- “about,” “more than,” “some,” “various,” “top-10,” “from $X” when precision is possible;
- long strings of synonyms;
- unexplained jargon;
- passive voice that hides responsibility;
- fragmented dramatic sentences used as decoration;
- fake urgency, fake scarcity, fake trend, fake social proof;
- claims that any competitor could copy unchanged.

## Checklists

### Before writing

- I know the reader and their problem.
- I know what action or decision the text should support.
- I have facts, examples, proof, or honest limitations.
- I know what the reader already understands and what needs explanation.
- I know the required format, channel, length, and tone.
- I know what not to promise.

### After writing

- The main point appears early.
- Every section solves a reader task.
- Every claim is supported or clearly framed as opinion/assumption.
- Evaluations are replaced with facts or examples.
- No fake trends, fake rankings, fake guarantees, or invented numbers.
- No decorative bureaucracy or corporate clichés.
- Important conditions, limits, risks, and next steps are clear.
- Sentences are not overloaded.
- Paragraphs have one job each.
- Headings help scan the text.
- The text can be read aloud without stumbling.
- The final version is shorter or more useful than the draft.

### When editing user text

- Preserve true facts and intent.
- Remove unsupported claims rather than making them sound nicer.
- If a claim needs proof, ask for proof or mark `[need fact]`.
- Keep the user’s tone unless it harms clarity, trust, or respect.
- Do not over-polish: stop when the text is clear, useful, and natural.

### When facts are missing

Use one of these moves:

- Ask for the missing fact.
- Replace the claim with a weaker honest version.
- Add a placeholder: `[add number]`, `[add source]`, `[add example]`.
- Use a real observation and label it as observation.
- Remove the claim if it is not needed.

## Output patterns

### If the user says "пиши и сокращай"

If source text is provided, return the improved version first. Then add only the most important missing facts or risks, if needed. Do not lecture about the method. If no source text is provided, ask for the text or write from the task description if the task is clear.

### If the user asks to write a text

Return the finished text. Do not explain every editing principle unless asked.

### If the user asks to improve a text

Return:

1. Improved version.
2. Short notes only for the most important changes, if useful.
3. Questions or missing facts, if any.

### If the user asks for critique

Use this structure:

- What works.
- What blocks the reader.
- What to fix first.
- Revised example.

### If the user asks for variants

Make variants meaningfully different by angle, structure, audience, or promise. Do not create five cosmetic rewrites of the same weak idea.

## Prompt templates for using this skill

Use these prompts when invoking the skill directly.

### Natural Russian trigger

```text
пиши и сокращай
[Paste the text to edit, or describe the text to write.]
Goal: [what the reader should do or understand]
Audience: [who will read it]
Format/limit: [channel, length, tone]
```

### Rewrite for clarity

```text
$pishi-sokrashchai
Rewrite this text so it is shorter, clearer, and more useful. Preserve facts. Remove unsupported praise and bureaucratic wording. Mark missing facts in square brackets.

Text:
...
```

### Create product copy

```text
$pishi-sokrashchai
Write product copy for [product]. Audience: [reader]. Goal: help the reader decide whether to buy. Facts: [facts]. Include benefits, proof, limitations, and next action. Avoid hype.
```

### Edit a landing page

```text
$pishi-sokrashchai
Review this landing page copy. Find vague claims, unsupported evaluations, missing proof, overloaded sentences, and weak structure. Then rewrite the hero section and the first three blocks.

Copy:
...
```

### Write an email

```text
$pishi-sokrashchai
Write an email to [recipient]. Situation: [context]. Goal: [action]. Tone: respectful and direct. Include reason, deadline, what the recipient needs to do, and how I can help.
```

### Explain a complex topic

```text
$pishi-sokrashchai
Explain [topic] to [audience]. Start from familiar concepts, introduce terms one by one, use examples, and avoid unexplained jargon. Goal: the reader should be able to [action].
```

### Shorten text

```text
$pishi-sokrashchai
Shorten this text by about [percentage/limit]. Keep meaning, facts, and useful details. Remove filler, repetition, and weak examples. Do not make it dry.

Text:
...
```

### Create headings

```text
$pishi-sokrashchai
Create headings for this article. Use navigation headings for sections and attention headings for the title. Each heading should help the reader predict the benefit or find the needed answer.

Article/outline:
...
```

### Write a job application

```text
$pishi-sokrashchai
Write a targeted job application for this vacancy. Match my experience to the requirements, avoid generic praise, and be honest about limits.

Vacancy:
...

My facts:
...
```

## Examples

### Corporate cliché → concrete usefulness

Bad:

```text
We are a young dynamic team of professionals offering turnkey solutions for businesses of any complexity.
```

Good:

```text
We set up online booking for small clinics. Patients choose a doctor and time on the website, receive a reminder, and can reschedule without calling reception.
```

### Unsupported evaluation → fact

Bad:

```text
Our course gives deep practical knowledge and helps you quickly master analytics.
```

Good:

```text
In 6 weeks students build three dashboards: sales by channel, repeat purchases, and manager performance. Each dashboard is reviewed by an analyst.
```

### Bureaucracy → direct message

Bad:

```text
Due to scheduled maintenance activities, temporary suspension of service availability may occur.
```

Good:

```text
The service will be unavailable on 12 May from 02:00 to 03:00. We are replacing the database server. Drafts will be saved.
```

### Euphemism → truth and next step

Bad:

```text
The team is experiencing temporary organizational difficulties that may affect delivery timelines.
```

Good:

```text
We missed the design deadline by 4 days because the contractor left the project. Today we hired a replacement. The new delivery date is 18 June.
```

### Vague price → clear expectation

Bad:

```text
Website development from $1,000.
```

Good:

```text
Landing page: $1,000. Online store with catalog and payment: from $3,500. After a 30-minute call, we send a fixed estimate.
```

### Passive construction → action

Bad:

```text
A decision was made to change the onboarding process.
```

Good:

```text
We changed onboarding: new users now see one setup task at a time instead of a 12-step checklist.
```

### Criticism of person → criticism of work

Bad:

```text
The author is careless and does not understand the topic.
```

Good:

```text
The article names three metrics but explains only one. The reader will not understand how to use the other two.
```

### Abstract → tangible

Bad:

```text
The app increases team productivity through transparent task management.
```

Good:

```text
The app shows who owns each task, when it is due, and what blocks it. Every morning the manager sees overdue tasks in one list.
```

### Weak headline → useful headline

Bad:

```text
Important update about security
```

Good:

```text
Reset your password by Friday to keep access to the dashboard
```

## Quality criteria

A strong final text meets these criteria:

- The reader understands the main point after the first screen or first paragraph.
- The text helps the reader solve a real task.
- The text is honest about facts, limits, risks, and uncertainty.
- The text contains proof where it asks for trust.
- The text uses simple words without losing accuracy.
- The text has no empty praise, status language, or generic corporate claims.
- The text is structured for scanning.
- The text sounds natural aloud.
- The text tells the reader what to do next.
- The text would still work if competitors removed their logos from it; it contains specific facts that belong to this product, person, or situation.

## Final rule

Do not argue about “beautiful words.” Improve the meaning: facts, examples, structure, proof, reader benefit, and action. When the meaning is strong, the wording becomes simpler.
