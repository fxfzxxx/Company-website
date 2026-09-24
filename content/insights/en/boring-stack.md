---
title: The boring stack is winning, and that is good news
dek: A relational database, server-rendered pages and one well-understood cloud. The most reliable systems we saw last year were built from parts nobody would put on a conference slide.
category: stack
date: 2026-02-11
---
Every few years the industry rediscovers that the simplest architecture that could possibly work usually does. We are in one of those years. Across the systems we reviewed for clients in the last twelve months, the ones that were cheapest to run, easiest to hand over and quickest to change shared a family resemblance: they were boring.

By boring we mean something specific. A single relational database, usually Postgres. An application that renders most of its pages on the server. One cloud provider, used mostly for its plainest services. A queue where a queue is genuinely needed, and nowhere else. A deploy that a new developer can understand on their first afternoon.

## Why the pendulum swung back

The last decade gave us an enormous toolkit for problems of scale: microservices, event streaming, polyglot persistence, client-side everything. These are real tools for real problems. The trouble is that most New Zealand businesses do not have those problems. A company with forty thousand customers and a dozen developers does not have a Netflix problem; it has a hiring problem, a handover problem and a budget problem.

Complexity has a running cost that rarely appears in the original business case. Every additional service is something to monitor, patch, secure and explain. Every additional data store is another place for records to disagree. When the team that built it moves on, the architecture diagram becomes an archaeological artefact.

## What boring buys you

- **Fewer ways to fail.** A monolith talking to one database has a handful of failure modes, all of them well documented. A distributed system has combinations.
- **Cheaper people.** Postgres, a mainstream web framework and a standard cloud are skills you can hire for in Auckland or Christchurch without a recruiter's premium.
- **Faster change.** When a feature touches one codebase and one schema, it ships in a day. When it touches four services, it ships after a meeting.
- **Honest costs.** A single database server and a handful of application instances produce a bill you can predict to within a few percent.

## Boring is not the same as old

This is not an argument against new technology. Modern Postgres does things that used to need three separate products: JSON documents, full-text search, vector similarity for AI retrieval, logical replication. Modern server-rendered frameworks deliver interactive pages without shipping a megabyte of JavaScript. Choosing boring means choosing the current version of well-understood tools, not freezing in 2012.

It also does not mean never splitting things up. When a part of the system genuinely has different scaling, security or release needs — a payment integration, a heavy batch job, a public API with its own customers — carve it out. The test is whether you can name the specific pressure that justifies the boundary.

## A useful default

When we start a new build, the default is one repository, one deployable application, one Postgres database, server-rendered pages with interactivity added where it earns its place, and managed hosting. Every departure from that default has to be argued for in writing, with the cost of running it included.

Most projects never need to depart from it. The ones that do are better for having had to say why.
