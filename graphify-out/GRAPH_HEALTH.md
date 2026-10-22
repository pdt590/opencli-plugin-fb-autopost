# Post-build graph health

This diagnostic checks the updated exported graph. It cannot reconstruct edges collapsed during extraction or graph construction.

[graphify] MultiDiGraph edge-collapse diagnostic
input: <in-memory>
input_stage: provided JSON (normal graph.json is post-build)
effective_directed: <direct-call>
nodes: 500
unverified_code_nodes: 0
raw_edges: 1311
valid_candidate_edges: 1311
missing_endpoint_edges: 0
dangling_endpoint_edges: 0
external_reference_edges: 0
self_loop_edges: 1
exact_duplicate_edges: 0
directed_unique_endpoint_pairs: 1311
directed_same_endpoint_collapsed_edges: 0
undirected_unique_endpoint_pairs: 1311
undirected_same_endpoint_collapsed_edges: 0
same_endpoint_group_count: 0
relation_variant_groups: 0
source_file_variant_groups: 0
source_location_variant_groups: 0
context_variant_groups: 0
post_build_graph_type: Graph
post_build_edges: 1311
producer_suppression_sites: 12
producer_suppression_examples:
  - L1789 seen_ids arity=unknown
  - L2353 seen_ids arity=unknown
  - L2355 seen_doc_refs arity=unknown
  - L3022 seen_ids arity=unknown
  - L3169 seen_ids arity=unknown
  - L4179 seen_keys arity=unknown
  - L4365 seen_keys arity=unknown
  - L7608 seen_ids arity=unknown
note: normal graph.json is post-build; raw producer loss must be measured earlier.