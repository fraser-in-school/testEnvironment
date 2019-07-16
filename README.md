# testEnvironment

按照我在本地的测试

首先需要安装engine.io

npm install engine.io@1.8.4

然后所有的依赖包都会装好

测试方法
1. 先运行ServerClass.js
2. 再命令行运行Client
	node ClientClasss.js username

3. client登录成功后，server
	输入 username:mess
3. server 会发送[0...1999]
4. client 收到[0,1999]

