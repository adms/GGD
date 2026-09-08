// Package community defines the publication pins carried only in signed match creation.
package community

type HeroPin struct {
	WorkID         string `json:"workId"`
	SubmissionID   string `json:"submissionId"`
	AuthorID       string `json:"authorId"`
	AuthorName     string `json:"authorName"`
	Name           string `json:"name"`
	PackageDigest  string `json:"packageDigest"`
	SnapshotDigest string `json:"snapshotDigest"`
}
