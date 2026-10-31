import { writeFileSync } from 'node:fs';
import { services } from '../packages/shared/src/index.ts';
let yaml = '';
for (const name of services)
  yaml += `---
apiVersion: v1
kind: Service
metadata: {name: ${name}}
spec:
  selector: {app: ${name}}
  ports: [{port: 4000, targetPort: 4000}]
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: ${name}}
spec:
  replicas: 1
  selector:
    matchLabels: {app: ${name}}
  template:
    metadata:
      labels: {app: ${name}}
    spec:
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30
      securityContext: {runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000}
      containers:
        - name: ${name}
          image: little-market-api:dev
          imagePullPolicy: IfNotPresent
          env:
            - {name: SERVICE_NAME, value: ${name}}
            - {name: PORT, value: '4000'}
            - name: INTERNAL_TOKEN
              valueFrom: {secretKeyRef: {name: market-secrets, key: INTERNAL_TOKEN}}
            - name: DATABASE_PASSWORD
              valueFrom: {secretKeyRef: {name: market-secrets, key: DATABASE_PASSWORD}}
            - {name: DATABASE_URL, value: 'postgres://market_${name}:$(DATABASE_PASSWORD)@postgres:5432/market'}
          ports: [{containerPort: 4000}]
          securityContext: {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: [ALL]}}
          resources:
            requests: {cpu: 25m, memory: 64Mi}
            limits: {cpu: 500m, memory: 256Mi}
          startupProbe:
            httpGet: {path: /health/live, port: 4000}
            failureThreshold: 30
            periodSeconds: 2
          readinessProbe:
            httpGet: {path: /health/ready, port: 4000}
            periodSeconds: 5
          livenessProbe:
            httpGet: {path: /health/live, port: 4000}
            periodSeconds: 10
`;
writeFileSync('deploy/base/services.yaml', yaml);
