trace runtime-trace.log,maincpu,noloop|logerror,{tracelog "CYC=%d ",totalcycles}
tracelog "CYC=%d %04X: debugger-start\n",totalcycles,pc
go
