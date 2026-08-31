// MUTATION-816-C (temporary) — a third Room<MatchState> that nobody gave a view.
import { Room } from "@colyseus/core";
import { MatchState } from "@ggd/shared/protocol/schema";
export class MutationThirdRoom extends Room<MatchState> {}
