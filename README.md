import boto3
from constants import TAG_IGNORE, ACTION_INFO


def _get_auto_scaling_client():
   return boto3.client("application-autoscaling", region_name="sa-east-1")


def _get_current_max_capacity(aas_client, resource_id: str, fallback: int = 3) -> int:
   """Busca o maxCapacity atual para não sobrescrever o valor original."""
   try:
       targets = aas_client.describe_scalable_targets(
           ServiceNamespace="ecs",
           ResourceIds=[resource_id],
           ScalableDimension="ecs:service:DesiredCount",
       )
       if targets["ScalableTargets"]:
           return targets["ScalableTargets"][0]["MaxCapacity"]
   except Exception:
       pass
   return fallback


def _adjust_auto_scaling(aas_client, resource_id: str, min_capacity: int, max_capacity: int, service_name: str):
   """Ajusta min/max do Auto Scaling antes do stop/start."""
   try:
       aas_client.register_scalable_target(
           ServiceNamespace="ecs",
           ResourceId=resource_id,
           ScalableDimension="ecs:service:DesiredCount",
           MinCapacity=min_capacity,
           MaxCapacity=max_capacity,
       )
       print(f"[AS] min={min_capacity} max={max_capacity} aplicado: {service_name}")
   except Exception as e:
       print(f"[AS] sem auto scaling em {service_name}: {str(e)}")


def update_services(client, services_arn: list, cluster_arn: str, new_desired_count: int):
   aas_client = _get_auto_scaling_client()

   for service in services_arn:
       tags = client.list_tags_for_resource(resourceArn=service)["tags"]

       if TAG_IGNORE in [tag["key"] for tag in tags]:
           print(f"[SKIP] IgnoreStartStop: {service}")
           continue

       cluster_name = cluster_arn.split("/")[-1]
       service_name = service.split("/")[-1]
       resource_id  = f"service/{cluster_name}/{service_name}"

       current_max = _get_current_max_capacity(aas_client, resource_id)

       if new_desired_count == 0:
           _adjust_auto_scaling(aas_client, resource_id,
                                min_capacity=0,
                                max_capacity=current_max,
                                service_name=service_name)
       else:
           _adjust_auto_scaling(aas_client, resource_id,
                                min_capacity=1,
                                max_capacity=current_max,
                                service_name=service_name)

       print(f"[ECS] {service_name} desiredCount → {new_desired_count}")
       client.update_service(
           cluster=cluster_arn,
           service=service,
           desiredCount=new_desired_count,
       )


def info():
   client   = boto3.client("ecs")
   clusters = client.list_clusters(maxResults=50)["clusterArns"]

   for cluster in clusters:
       try:
           response = client.list_services(
               cluster=cluster,
               maxResults=50,
               launchType="FARGATE",
               schedulingStrategy="REPLICA",
           )
           print(response)
       except Exception as e:
           print("Error:", str(e))


def execute(action: str):
   if action == ACTION_INFO:
       info()
       return

   client   = boto3.client("ecs")
   clusters = client.list_clusters(maxResults=50)["clusterArns"]

   for cluster in clusters:
       try:
           response = client.list_services(
               cluster=cluster,
               maxResults=50,
               launchType="FARGATE",
               schedulingStrategy="REPLICA",
           )
       except Exception as e:
           print("Error:", str(e))
           continue

       services = response["serviceArns"]

       if action == "start":
           update_services(client, services, cluster, 1)
       elif action == "stop":
           update_services(client, services, cluster, 0)
       else:
           print("Unknown action:", action)
