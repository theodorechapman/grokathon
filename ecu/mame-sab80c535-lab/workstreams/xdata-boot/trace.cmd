trace runtime-trace.tmp,maincpu,logerror,{tracelog "CYC=%d ",totalcycles}
tracelog "CYC=%d %04X: debugger-start\n",totalcycles,pc
go
