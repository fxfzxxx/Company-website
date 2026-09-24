---
title: The real cost of an AI feature
dek: The token bill is the smallest line in the budget. Evaluation, review, support and change management are where AI features actually cost money — and where the business case should look first.
category: ai
date: 2026-06-17
---
When a business case for an AI feature reaches us, the cost section is usually a single calculation: expected requests per month multiplied by the price per request. It is often a reassuringly small number. It is also, in our experience, somewhere between a fifth and a tenth of what the feature will actually cost to run well.

This is not an argument against AI features. Many of them pay for themselves many times over. It is an argument for estimating them honestly, because the projects that disappoint are rarely the ones that failed technically. They are the ones whose running costs were never in the plan.

## The full cost model

We break an AI feature's cost into six lines.

1. **Inference.** The provider's bill, or the cost of hosting your own model. Include retries, longer prompts than you expect once retrieval context is added, and the fallback to a larger model for hard cases.
2. **Evaluation.** Building and maintaining the set of examples that tells you whether the feature works. This is ongoing: every new failure becomes a new case, and someone has to label them.
3. **Human review.** For most business uses, some share of outputs is checked by a person — all of them at first, a sample later. That time is real and belongs in the budget.
4. **Integration and monitoring.** Logging, dashboards, alerting on quality and cost, and the engineering to connect the feature to the systems it reads and writes.
5. **Change.** Models are updated, prices move, and prompts need adjusting. Budget for a small amount of engineering every quarter simply to keep the feature at its current quality.
6. **Adoption.** Training, revised procedures, and the support load while people learn to trust — and to correctly distrust — the new tool.

## Where the money usually goes

On the features we have delivered this year, inference is typically the smallest or second-smallest line. Human review and change dominate in the first six months. Evaluation is the one most often left out of the original estimate, and the one whose absence causes the most expensive problems later.

The good news is that several of these costs fall over time. Review drops from every output to a sample as confidence grows. Evaluation effort shrinks once the example set covers the main failure modes. Inference costs, for a given level of quality, have generally trended down.

## Pricing the value, not just the cost

A complete model also needs the other side of the ledger, stated in the same units. Hours saved per month, at a real loaded rate. Errors avoided, with their typical cost. Revenue from faster response or higher conversion, if it can be measured. Compare the full cost against a measured baseline, and the decision becomes straightforward — in either direction.

## The questions to ask of any AI business case

- Where does the per-request cost come from, and does it include retrieval context and retries?
- Who reviews outputs, how many, and for how long?
- Who maintains the evaluation set, and how much time is that?
- What is the quarterly budget for keeping the feature current?
- What is today's baseline for the outcome it is meant to improve?

If those answers exist, the business case is ready. If they don't, the headline number is a guess.
