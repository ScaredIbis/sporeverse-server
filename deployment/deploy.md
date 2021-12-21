# Deployment

The API may be run inside Kubernetes or in its stand alone docker container. It does however require ENV variables which must be setup in one of the following two ways.

This k8s deployment files assume that there is a Cloud SQL Postgres database running within the gcp account

## K8s

### Secrets and environment variables

Populate a .env and .secrets file holding the following variables:

```
# .env

EXECUTIONER_URL=<deployed executioner url>
OME_URL=<deployed ome url>
ETH_PROVIDER_URL=<deployed rpc url>
PORT=3030
DISCORD_ALERTS_WEBHOOK_URL=<webhook url>
RPC_URL_ARBITRUM=<arbitrum mainnet rpc url>
```

```
# .secrets

PGUSER=tracer
PGHOST=localhost
PGPASSWORD=tracer
PGDATABASE=tracer
PGPORT=5432
```

`kubectl create configmap api-env --from-env-file=<env_file_location>`
`kubectl create secret generic api-secrets --from-env-file=<secrets_file_location>`

If you are updating secrets or env vars, you can reset them in the k8s cluster by deleting and then recreating them

`kubectl delete secret api-secrets`
`kubectl create secret generic api-secrets --from-env-file=<secrets_file_location>`

`kubectl delete configmap api-env`
`kubectl create configmap api-env --from-env-file=<env_file_location>`

## Releasing a new version

Ensure that `deployment/setupRelease.sh` is executable with `chmod +x deployment/setupRelease.sh`

You may also need to install `jq` and `ytt`

Use the `deployment/setupRelease.sh` to help you to perform the following:

- update version in `package.json` via `yarn version`
  - this will also add a git tag to your local machine. [see more](https://classic.yarnpkg.com/en/docs/cli/version/)
- build a new version of the docker image tagged with the new version
- push the new docker image to gcr
- update the image in the Kubernetes deploy config

You can now utilise the `deploy.yaml` file and deploy to a K8s cluster using `kubectl apply -f deploy.yaml`

Once your deployment is running, you will need to expose the deployment if you wish to access it externally.

You can expose the API via an ingress. The following details how to do this on GCP.

First create a NodePort service using `kubectl apply -f service.yaml`. Now, you will need to create a static IP in GCP called `perpetual-api-ip`. Next, create a managed GCP certificate using `kubectl apply -f cert.yaml`. Finally to expose your pods to the world, you have to run `kubectl apply -f ingress.yaml` to create an ingress. Simply point your DNS provider to this ingress IP and you should be good to go accessing the API at that IP. For more, see this (Google Guide)[https://cloud.google.com/kubernetes-engine/docs/how-to/managed-certs]
