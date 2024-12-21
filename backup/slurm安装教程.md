# 集群设置与配置指南

在集群计算中，为了高效地进行分布式计算和资源管理，需要对各个节点进行一系列的设置与配置。本指南详细描述了如何完成无密码登录、静态 IP 设置、NFS 配置、作业调度与性能监控等任务。

---

## 1. 设置无密码登录、静态 IP 以及修改 `hosts` 与 `hostname`

### 1.1 生成 SSH 密钥并分发到节点
在主管理节点（假设为 master 节点）上生成 SSH 密钥对：

```bash
ssh-keygen -t rsa -b 2048
```

分发公钥到各个节点以便无密码登录：

```bash
sshpass -p 节点登录密码 ssh-copy-id -i ~/.ssh/id_rsa.pub username@节点ip
```

> [!NOTE]  
> 分发的密钥应由普通用户生成，而不是 `root` 用户。此外，确保 `sshpass` 已安装。

---

### 1.2 批量修改节点 IP 和主机名的脚本示例
以下是一个批量修改脚本的示例，可设置静态 IP 和主机名：

```bash
#!/bin/bash
IPS=("172.26.96.117" "172.26.96.118" "172.26.96.119")
HOSTNAMES=("node1" "node2" "node3")
NEW_IPS=("192.168.1.201" "192.168.1.202" "192.168.1.203")

for i in "${!IPS[@]}"; do 
   IP=${IPS[$i]} 
   HOSTNAME=${HOSTNAMES[$i]} 
   NEW_IP=${NEW_IPS[$i]}
   
   ssh root@$IP "hostnamectl set-hostname $HOSTNAME"
   ssh root@$IP "echo '$NEW_IP $HOSTNAME' >> /etc/hosts"

   ssh root@$IP "cat <<EOF > /etc/netplan/01-netcfg.yaml
   network:
     version: 2
     ethernets:
       ens33:
         dhcp4: no
         addresses: [$NEW_IP/24]
         gateway4: 192.168.1.1
         nameservers:
           addresses: [8.8.8.8, 8.8.4.4]
   EOF"
   
   ssh root@$IP "netplan apply"
done
```

> [!IMPORTANT]  
> 根据实际网卡名称和网关地址修改脚本中的 `ens33` 和 `gateway4` 参数。

---

## 2. 配置 NFS（网络文件系统）

### 2.1 在管理节点安装 NFS 服务
安装 NFS 服务器端：

```bash
sudo apt-get install nfs-kernel-server
```

### 2.2 配置共享目录
假设 `/opt` 是要共享的目录，并且 `172.16.0.0/24` 是允许访问的网络范围：

```bash
echo "/opt 172.16.0.0/24(rw,sync,no_root_squash)" | sudo tee -a /etc/exports
```

重启服务并设置开机自启：

```bash
sudo systemctl restart nfs-kernel-server
sudo systemctl enable nfs-kernel-server
```

> [!TIP]  
> 为了提高 NFS 性能，可以在配置中使用 `async` 参数，但需要注意可能会带来数据一致性问题。

---

### 2.3 在节点挂载共享目录
安装 NFS 客户端：

```bash
sudo apt-get install nfs-common
```

挂载共享目录：

```bash
sudo mount -t nfs 管理节点IP:/opt /opt
```

为了挂载持久化，可在 `/etc/fstab` 文件中添加以下行：

```bash
管理节点IP:/opt /opt nfs defaults 0 0
```

> [!WARNING]  
> 确保共享目录有正确的权限，避免节点间因权限问题导致挂载失败。

---

## 3. 配置 NIS（网络信息服务）

NIS 是用于集中管理用户账户的服务，便于在集群中统一用户信息。

### 3.1 配置 NIS 服务器
安装 NIS 服务器端：

```bash
sudo apt install nis
```

在 `/etc/default/nis` 文件中，启用 NIS 服务并设置：

```bash
NISSERVER=true
```

在 `/etc/yp.conf` 文件中，配置 NIS 域名：

```bash
domain master的hostname server master的IP地址
```

生成 NIS 数据库：

```bash
sudo /usr/lib/yp/ypinit -m
```

> [!NOTE]  
> 配置完成后，重启 NIS 服务：

```bash
sudo systemctl restart ypserv ypbind
```

---

### 3.2 配置 NIS 客户端
在每个节点安装 NIS 客户端：

```bash
sudo apt install nis
```

配置 `/etc/yp.conf` 文件，确保能够连接到管理节点：

```bash
domain master的hostname server master的IP地址
```

启动 NIS 绑定服务：

```bash
sudo systemctl start ypbind
```

---

## 4. 安装和配置 Munge

Munge 用于提供集群中的认证服务。

### 4.1 在管理节点生成密钥
安装 Munge：

```bash
sudo apt install munge munge-devel
```

生成密钥：

```bash
sudo create-munge-key
```

将密钥复制到所有节点：

```bash
sudo scp /etc/munge/munge.key root@node:/etc/munge/munge.key
```

确保密钥文件的权限正确：

```bash
sudo chmod 400 /etc/munge/munge.key
sudo chown munge:munge /etc/munge/munge.key
```

> [!IMPORTANT]  
> 确保所有节点上的 Munge 用户和组的 UID 和 GID 一致。

---

## 5. 安装和配置 Slurm

Slurm 是一款强大的集群资源管理与作业调度工具。

### 5.1 安装 Slurm
在所有节点安装 Slurm：

```bash
sudo apt install slurm-wlm
```

### 5.2 配置 Slurm
在管理节点配置 `/etc/slurm-llnl/slurm.conf` 文件：

```bash
ClusterName=cluster_name
SlurmdPort=7003
SlurmctldPort=7002
SlurmdAddr=管理节点IP
SlurmctldAddr=管理节点IP
```

启动 Slurm 服务：

```bash
sudo systemctl start slurmctld
sudo systemctl enable slurmctld
```

> [!CAUTION]  
> 确保 `slurm.conf` 中的节点名称与实际节点一致，否则服务无法正常启动。

---

## 6. 安装 MPI 并进行测试

MPI 用于并行计算，可与 Slurm 结合使用。

### 6.1 安装 Open MPI
在所有节点安装 Open MPI：

```bash
sudo apt-get install openmpi-bin openmpi-common libopenmpi-dev
```

### 6.2 配置环境变量
在每个节点的 `.bashrc` 文件中添加：

```bash
export PATH=/usr/lib/openmpi/bin:$PATH
export LD_LIBRARY_PATH=/usr/lib/openmpi/lib:$LD_LIBRARY_PATH
```

### 6.3 测试 MPI 程序
运行测试程序：

```bash
mpirun -np 4 hello_world
```

> [!TIP]  
> 如果运行失败，检查 MPI 环境变量配置是否正确，以及节点间的通信是否正常。

---

## 7. 性能监控与调优

- **使用 Ganglia**：监控 CPU、内存、磁盘 I/O 等集群性能指标。
- **优化作业调度**：根据作业优先级配置 Slurm 的 `fairshare` 和 `QoS` 策略。

> [!IMPORTANT]  
> 性能监控和调优是集群稳定运行的关键环节，应定期检查集群的运行状态。

---

通过以上步骤，集群的基本配置就完成了。如果您有其他问题或需求，请随时留言讨论！ 😊

# 8. 安装并配置 Ganglia（集群监控）

### 安装 Ganglia

在管理节点上安装 Ganglia 的监控工具：

```bash
sudo apt-get install ganglia-monitor gmetad ganglia-webfrontend
```

然后安装 Ganglia 监控客户端：

```bash
sudo apt-get install ganglia-monitor
```

### 配置 Ganglia

配置监控服务器和客户端的配置文件：

- **在管理节点上配置 gmetad**  
   编辑 `/etc/ganglia/gmetad.conf` 文件，确保它配置了正确的 IP 地址和端口。

- **配置客户端**  
   在每个计算节点上编辑 `/etc/ganglia/gmond.conf` 文件，确保它能够与管理节点进行通信。

```bash
udp_send_channel {
  host = 管理节点 IP
  port = 8649
}
```

### 启动 Ganglia 服务

启动 `gmetad` 和 `gmond` 服务：

```bash
sudo systemctl start gmetad
sudo systemctl enable gmetad
sudo systemctl start ganglia-monitor
sudo systemctl enable ganglia-monitor
```

### 配置 Ganglia Web 前端

启动 Web 服务器来访问监控界面：

```bash
sudo systemctl start apache2
sudo systemctl enable apache2
```

访问 `http://管理节点 IP/ganglia`，即可查看集群状态和性能指标。

---

# 9. 配置作业调度与负载平衡

### 作业调度

配置 Slurm 后，您可以通过 `srun` 命令来调度作业。例如，提交一个使用 4 个节点并行计算的作业：

```bash
srun -n 4 --mpi=pmi2 ./your_mpi_program
```

这将启动一个 MPI 程序，使用 4 个节点并行计算。

### 负载平衡

Slurm 会根据计算节点的负载情况自动进行负载平衡。例如，提交作业时，Slurm 会将作业分配到负载较低的节点。

如果您希望更精确地控制负载平衡，可以配置 Slurm 的 `partitions` 和 `job scheduling policies`，这将允许您设置作业的优先级和资源分配规则。

---

# 10. 性能调优与监控

对于大型集群，性能监控和调优至关重要。

- **监控系统性能**：使用 Ganglia 或其他工具（如 Prometheus）来实时监控 CPU 使用率、内存消耗、磁盘 I/O 等。
- **优化作业调度策略**：根据集群负载、作业优先级和计算资源配置优化作业调度策略。
- **资源分配**：使用 Slurm 的 `fairshare` 和 `quality of service (QoS)` 配置，确保资源的公平分配并限制恶意或低效作业的资源占用。

---

# 11. 集群安全性

确保集群的安全性是一个持续的任务。以下是一些基本的安全措施：

- **限制 SSH 访问**：确保只有经过授权的用户能够通过 SSH 连接到集群。
- **配置防火墙**：限制对管理节点和计算节点的网络访问，只允许特定的 IP 地址和端口。
- **启用审计日志**：确保所有操作和访问都被记录，以便日后审核。

