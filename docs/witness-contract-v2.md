# Witness Contract v2

Status: principal-accepted contract terms (2026-09-16). This document is the binding specification for the revised Witness lane. The prior Witness implementation is classified PROTOTYPE and is not merged under these terms.

## Governing law

Agreement is not truth. Consensus grants no authority. Unresolved evidence remains unresolved. The principal retains final judgment.

## Inputs

1. **No position in the input.** The caller's position, classification, or preferred conclusion is never supplied to the Witness.
2. **Atomic claims and artifact paths only.** Each claim is a single assertable statement with a stable id. Subjects and evidence are supplied as paths — never as narrative briefs or persuasive summaries.
3. **Matrices are subjects, not evidence.** Doctrine and conformance matrices are under review; they are never evidence for themselves.

## Evidence rules

4. **Direct byte reads.** Every repository-evidence claim requires a direct read of the referenced artifact. Any code-index or navigation layer is navigation help only — never evidence.
5. **Binding stated or unprovable.** The report must state the repository/snapshot binding its reads were made against, or explicitly state that the binding is unprovable.

## Report handling

6. **Verbatim preservation.** The Witness report is preserved verbatim before any reconciliation is authored. Reconciliation is a separate artifact, written after the verbatim record exists.

## Dispositions

7. **Every objection gets exactly one disposition:**
   - `ACCEPTED_WITH_CHANGE`
   - `REJECTED_WITH_NAMED_EVIDENCE`
   - `UNRESOLVED`

   "Noted" is not a disposition.

## Reserved lane

8. **Self-confinement claims are reserved.** Claims about the Witness's own confinement go to principal/CI review. The Witness does not adjudicate claims about itself.

## Verification vocabulary

9. **Evidence inspection status** (independent axis):
   - `SOURCE_ONLY`
   - `SOURCE_AND_TEST_SPEC_VERIFIED`
   - `PARTIAL`
   - `UNVERIFIED`
   - `DISPUTED`

10. **Test execution status** (independent axis):
    - `EXACT_BOUND_TEST_PASSED` (bound = exact commit)
    - `FAILED`
    - `NOT_RUN`

## Never-close clause

Witness agreement never:

- closes a `NOT_RUN` test status;
- proves snapshot byte identity without Git evidence;
- grants authority of any kind;
- replaces the principal's ruling.
