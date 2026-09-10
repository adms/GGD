# Rejected for end-to-end training

This dataset is retained as an audit artifact only. Its `forge-json-atom@1`
inputs contain a `cursor.path` supplied from the teacher's future JSON tree.
That path cannot be derived for an unseen hero before the model has generated
the preceding shape decisions. Do not use it for training, checkpoint
selection, inference, or quality claims.

`../hero74-action-v2/` supersedes it with an action sequence where the script
derives each frontier cursor solely from previously accepted model actions.
