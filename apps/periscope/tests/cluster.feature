Feature: Periscope reads the live demo cluster over MCP

  # Requires the demo cluster to be up and seeded (see ../cluster/):
  #   ./cluster/start.sh && ./cluster/ingress.sh
  # Fixtures live in namespace `demo`: a 3-replica nginx Deployment `web`
  # (+ its Service), a two-container `sidecar` Pod, a `pi` Job, a `demo-config`
  # ConfigMap and a `demo-secret` Secret. The `kubernetes` CI job brings this up
  # before running these scenarios; without a cluster the app can't connect, so
  # `apps/periscope/.bdd-skip` keeps it out of the published-binary `--all` sweep.

  Scenario: the cluster connects and the demo workloads come through MCP
    Given the vantage-ui app is launched
    When the app has finished starting up
    Then there are no error log entries

    When the data tools are ready
    Then the model list includes "nodes"
    And the model list includes "namespaces"
    And the model list includes "pods"
    And the model list includes "deployments"
    And the model list includes "services"

    # Cluster-scoped lists: at least the single minikube/k3s node, and the demo namespace.
    And the data script holds: table("nodes").count() >= 1
    And the data script holds: table("namespaces").add_condition_eq("name", "demo").count() == 1

    # The nginx Deployment `web` and at least its three replica pods in `demo`.
    And the data script holds: table("deployments").add_condition_eq("name", "web").count() == 1
    And the data script holds: table("pods").add_condition_eq("namespace", "demo").count() >= 3

    # The remaining demo fixtures: the Service, the ConfigMap and the Job.
    And the data script holds: table("services").add_condition_eq("name", "web").count() == 1
    And the data script holds: table("configmaps").add_condition_eq("name", "demo-config").count() == 1
    And the data script holds: table("jobs").add_condition_eq("name", "pi").count() == 1
