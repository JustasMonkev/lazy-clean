# Design checks

When a change affects module responsibilities, dependencies, or extension points,
use SOLID to reduce the cost of that real change:
- S: Group behavior that changes for the same stakeholder or reason. Separate
  independently changing policy from presentation and storage details.
- O: Extend an existing contract for a requested variation. Add a small extension
  point only when the current need earns it; keep stable policy independent.
- L: Interchangeable implementations must preserve accepted inputs, results,
  errors, state, and lifecycle promises. Exercise the same contract against each.
- I: Give consumers only the capabilities they use. Avoid whole-service objects
  and unused stubs when a narrow function, type, or protocol suffices.
- D: Let policy own the capability it needs; supply external adapters at the
  entry point. Ordinary parameters can provide the seam.

Before deleting a helper or adapter, ask what its callers would have to know
afterward. One caller or production implementation is not evidence of waste.
Keep boundaries that hide real complexity, independent change, or external
details; remove layers that provide none of those benefits. Do not introduce
classes, registries, or interface hierarchies merely to satisfy a principle.

Review requested behavior first, then design quality as a separate judgment.
A clean scan or smaller diff does not prove either.
