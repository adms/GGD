{{/* Common labels */}}
{{- define "ggd.labels" -}}
app.kubernetes.io/part-of: ggd
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* Selector labels for one component: include with (dict "root" . "name" "platform") */}}
{{- define "ggd.selector" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end -}}
