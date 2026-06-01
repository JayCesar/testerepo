# testerepo
Teste

import boto3
from constants import TAG_IGNORE

def update_services(client, services_arn, cluster_arn, new_desired_count):
    aas_client = boto3.client("application-autoscaling", region_name="sa-east-1")

    for service in services_arn:
        response = client.list_tags_for_resource(resourceArn=service)
        tags = response["tags"]

        if TAG_IGNORE in [tag["key"] for tag in tags]:
            print("Ignoring service:", service)
            continue

        cluster_name = cluster_arn.split("/")[-1]
        service_name = service.split("/")[-1]
        resource_id = f"service/{cluster_name}/{service_name}"

        try:
            if new_desired_count == 0:
                # Seta min=0 para o AS não sobrescrever
                aas_client.register_scalable_target(
                    ServiceNamespace="ecs",
                    ResourceId=resource_id,
                    ScalableDimension="ecs:service:DesiredCount",
                    MinCapacity=0,
                    MaxCapacity=3,
                )
                print(f"[AS] min=0 aplicado: {service_name}")
            else:
                # Restaura min=1 ao startar
                aas_client.register_scalable_target(
                    ServiceNamespace="ecs",
                    ResourceId=resource_id,
                    ScalableDimension="ecs:service:DesiredCount",
                    MinCapacity=1,
                    MaxCapacity=3,
                )
                print(f"[AS] min=1 restaurado: {service_name}")
        except Exception as e:
            # Serviço sem auto scaling configurado — ok, segue
            print(f"[AS] sem auto scaling em {service_name}: {str(e)}")

        print(f"Updating {service_name} desiredCount → {new_desired_count}")
        client.update_service(
            cluster=cluster_arn,
            service=service,
            desiredCount=new_desired_count,
        )

