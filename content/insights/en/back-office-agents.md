---
title: Agents in the back office start with reconciliation
dek: The most useful AI agents we have deployed this year do not talk to customers. They match invoices, chase exceptions and hand a person the three cases that actually need judgement.
category: ai
date: 2026-04-15
---
"Agent" has become one of the most stretched words in technology. It can mean anything from a chatbot with a search tool to a system that plans and executes multi-step work across several applications with little supervision. The demos tend toward the dramatic end: an agent that books travel, negotiates with suppliers, runs a marketing campaign.

The deployments that are quietly paying for themselves look very different. They sit in finance and operations, they do narrow, repetitive work that already has clear rules, and they are designed around the moment where a person takes over.

## Why reconciliation is the ideal first job

Reconciliation — matching one set of records against another and explaining the differences — has almost every property you want in a first agent project.

- **High volume, low variety.** Hundreds or thousands of similar items a month, most of which match cleanly.
- **Clear definition of done.** A line either reconciles or it does not. The agent's success can be measured without debate.
- **Existing rules.** Finance teams already know why things fail to match: timing differences, partial payments, rounding, a supplier who invoices under two names.
- **Contained blast radius.** The agent proposes matches and drafts explanations; nothing leaves the building without a person approving it.
- **Painful today.** It is work people dislike, which makes adoption far easier than automating work people enjoy.

## How the good ones are built

The pattern we use is deliberately unambitious. The agent takes the unmatched items, applies deterministic rules first — exact amounts, reference numbers, known supplier aliases — and only then uses a language model for the fuzzy cases: reading a remittance email, recognising that "ACME Ltd" and "Acme Holdings" are the same payer, spotting that three payments sum to one invoice.

Every proposed match carries its reasoning and its evidence. Items are sorted into three buckets: matched with high confidence, matched but needs a glance, and genuinely unresolved. The person's job shifts from doing the matching to reviewing the second bucket and resolving the third.

Crucially, every human decision is recorded. When someone corrects a proposed match, that becomes a new rule or a new evaluation example. The agent gets better at this business's quirks month by month, in a way anyone can audit.

## What to measure

- The share of items auto-matched, and the error rate in that share, checked by sampling.
- Time from period close to reconciliation complete.
- Hours of staff time per month on the task, before and after.
- The number of exceptions that reach a person, and how long each takes.

On the projects we have run, the headline result is rarely headcount. It is that month-end finishes days earlier, and the people who used to do the matching now spend their time on the exceptions that were always the valuable part of the job.

## The broader lesson

Start agents where the rules are known, the output is checkable and a person already owns the result. Customer-facing autonomy can come later, once you have learned — on work that forgives mistakes — how your agents fail.
