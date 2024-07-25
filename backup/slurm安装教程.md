# 1.设置无密码登录静态ip以及修改hosts与hostname

1. 首先，确保你的DHCP服务器正在运行，并且可以通过它来查看分配给节点的IP地址。

2. 接着，在主管理节点（假设为master节点）上生成一个SSH密钥对：

ssh-keygen -t rsa -b 2048

这是为master用户生成的SSH密钥对，而不是root用户的密钥。

3. 分发公钥到各个节点以便无密码登录：

sshpass -p 节点登录密码 ssh-copy-id -i ~/.ssh/id_rsa.pub username@节点ip

其中`username`是节点上的用户名，`节点ip`是你要连接的节点的IP地址。

### 下面是一个用于批量修改节点IP地址和主机名的脚本示例：

```
#!/bin/bash
IPS=("172.26.96.117" "172.26.96.118" "172.26.96.119") # 当前的节点IP地址 HOSTNAMES=("node1" "node2" "node3") # 对应的主机名 NEW_IPS=("192.168.1.201" "192.168.1.202" "192.168.1.203") # 对应的新静态IP地址
for i in "${!IPS[@]}" do IP=${IPS[$i]} HOSTNAME=${HOSTNAMES[$i]} NEW_IP=${NEW_IPS[$i]}
   ssh root@$IP "hostnamectl set-hostname $HOSTNAME"
   ssh root@$IP "echo '$NEW_IP $HOSTNAME' >> /etc/hosts"

   #配置静态IP地址（根据你的系统使用适当的配置方式，以下是netplan配置的示例）
   ssh root@$IP "cat <<EOF > /etc/netplan/01-netcfg.yaml
   network:
     version: 2
     ethernets:
       ens33:  # 替换为你的网卡名称
         dhcp4: no
         addresses: [$NEW_IP/24]
         gateway4: 192.168.1.1  # 替换为你的网关
         nameservers:
           addresses: [8.8.8.8, 8.8.4.4]
   EOF"

   ssh root@$IP "netplan apply"
done
```

# 2.安装和配置NFS：使用nfs-kernel-server和nfs-common包设置NFS服务器，为节点间提供共享存储
打开终端，使用以下命令安装NFS服务器端和客户端：
```
#在master主机
sudo apt-get install nfs-kernel-server
```
```
#在节点机
sudo apt-get install nfs-common
```
## 配置NFS共享目录

/opt是要共享的文件夹,172.16.0.0/24是能够连到master主机的网络范围
```
echo "/opt 172.16.0.0/24(rw,sync,no_root_squash)" | sudo tee -a /etc/exports 
```
### 重启NFS服务，并确保它设置为开机自启：

```
sudo systemctl restart nfs-kernel-server
sudo exportfs -ra
sudo systemctl enable nfs-kernel-server

```
### 在客户端验证并挂载NFS共享

`showmount -e master IP地址
`
`sudo mount -t nfs IP地址:/opt /opt  #挂载master的opt文件夹至节点机的opt文件夹`

### 为了使挂载持久化，需要在客户端的/etc/fstab文件中添加以下行：

`172.16.0.11:/opt /opt nfs defaults 0 0`

# 3.设置NIS（网络信息服务）来管理用户账户

安装NIS:

`sudo apt install nis`

### 配置NIS服务器:

编辑 /etc/default/nis 文件，确保启用NIS服务，设置 NISSERVER=true。

### 配置NIS域名:
在 /etc/yp.conf 中设置你的NIS域，在yp.conf中增加如下：

`domain master的hostname server master的ip地址`

### 使用以下命令创建NIS域：
`sudo ypdomainname master的hostname`

生成/etc/defaultdomain，并保证此文件里只有master的hostname

### 编辑 /etc/nsswitch.conf，调整此文件以使用NIS进行用户信息查询：
修改如下
```
passwd: files nis
group: files nis
shadow: files nis

```

### 在 NIS 服务器上重新初始化 NIS 数据库：

`sudo /usr/lib/yp/ypinit -m
`
当提示输入主机名时，输入master主机名 hostname，然后按 Ctrl+D 结束输入。

### 启动 NIS 服务：

```
sudo systemctl start ypserv
sudo systemctl start ypbind
```
### 检查 NIS 服务状态，确保服务正常运行：

```
sudo systemctl status ypserv
sudo systemctl status ypbind

```
## 客户端配置 
编辑 /etc/yp.conf 文件
在客户端 NOVA 上编辑 /etc/yp.conf 文件，配置 NIS 服务器：
`domain master的hostname server master的ip地址`

### 在节点机上设置默认域名：
`echo "master的hostname" | sudo tee /etc/defaultdomain`

### 启动 NIS 绑定服务：
`sudo systemctl start ypbind`

### 确保客户端正确绑定到 NIS 域：
`sudo systemctl status ypbind`

### 使用 ypcat 命令测试是否能从 NIS 服务器获取数据：
`sudo ypcat passwd`

# 4.安装 Munge

在所有节点上（包括所有计算节点和管理节点），使用以下命令安装 Munge：

`sudo yum install munge
sudo yum install munge-devel
`


### 在管理节点生成 Munge 密钥

`sudo create-munge-key`

### 复制秘钥到节点用户文件夹

```
sudo scp /etc/munge/munge.key user@node:/home/user/munge.key

sudo mv /home/user/munge.key /etc/munge
```

### 在所有节点上启动 Munge 服务并设置为开机自启：

```
sudo systemctl start munge
sudo systemctl enable munge
```

### 确保 UID 和 GID 一致
Munge 的操作依赖于一致的用户和组 ID (UID 和 GID)。确保在所有节点上，munge 用户和组的 UID 和 GID 是一致的。
在所有节点上，运行以下命令检查 munge 用户和组的 UID 和 GID：
`id munge`
### 同步 UID 和 GID
如果发现 UID 和 GID 不一致，你可以手动同步它们。比如，如果你发现 munge 用户的 UID 和 GID 不一致，你可以通过修改 /etc/passwd 和 /etc/group 文件来同步。
在管理节点上：
```
sudo usermod -u 1234 munge
sudo groupmod -g 1234 munge
```
在所有其他节点上执行相同的操作，确保 UID 和 GID 一致


### 确保 Munge 服务正在运行，并且配置正确。在所有节点上运行：

`munge -n`
这个命令应该返回一个加密的凭证而没有错误信息。

```
sudo systemctl start munge
#查看是否连通（这一步验证不过，报错unmunge: Error: Invalid credential 重启对端munge服务即可）
munge -n | ssh node0 unmunge

```

# 5.slurm的安装步骤
### 安装依赖的软件包
最好从github上下载slurm的安装包 https://github.com/SchedMD/slurm/
### 首先，在opt文件夹里解压这个 ZIP 文件：
`unzip slurm-master.zip`
### 进入解压后的 SLURM 目录：
`cd slurm-master`
### 编译和安装 SLURM
`./configure`
make
### 安装 SLURM 到系统目录：
`sudo make install`

slurmd: 完成计算节点的任务（启动任务、监控任务、分层通信）
slurmctld: 完成管理节点的任务（故障切换、资源监控、队列管理、作业调度）
```
sudo apt update
sudo apt install slurm-wlm
# `slurmd`: compute node daemon
sudo apt install slrumd  （提示已安装）
# `slurmctld`: central management daemon
sudo apt install slurmcd'ptld  （提示已安装）
```

### 找到slurm-wlm-configurator.html文件，进入该目录下输入以下命令`
```
dpkg -L slurmctld | grep slurm-wlm-configurator.html
#/usr/share/doc/slurmctld/slurm-wlm-configurator.html

cd /usr/share/doc/slurmctld
sudo chmod +r slurm-wlm-configurator.html
```

### 利用 web 生成配置文件
`python3 -m http.server`

Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/)

在master浏览器中输入http://:8000/进入配置页面，点击进入 slurm-wlm-configurator.html 按照自己的需求填写设置。

填写完毕后，点击submit，将生成的内容拷贝进 /etc/slurm/slurm.conf （slurm 的配置文件）

###  创建
`sudo touch /etc/slurm/slurm.conf`
###  将网页生成的内容 copy 进来
` sudo vim /etc/slurm/slurm.conf`

### 手动创建slurm的输出文件目录
```
sudo mkdir /var/spool/slurmd
sudo mkdir /var/spool/slurmctld
```
### 启动 slurmd, 日志文件路径为 `/var/log/slurmd.log`
` sudo systemctl start slurmd`
### 启动 slurmctld, 日志文件路径为 `/var/log/slurmctld.log`
`sudo systemctl start slurmctld`

启动后无法正常使用 slurm 的话，先查看slurmd和slurmctld的状态，打开日志查看报错。

### 查看 slurmd 的状态
` sudo systemctl status slurmd`
### 查看 slurmctld 的状态
` sudo systemctl status slurmctld`


完成




























