trace logs/mame-microcase.trace,maincpu,noloop|logerror,{tracelog "N=%d CYC=%d PC=%04X A=%02X B=%02X PSW=%02X SP=%02X DPTR=%04X IE=%02X IP=%02X\n",0,totalcycles,pc,a,b,psw,sp,dptr,ie,ip}
tracelog "N=%d CYC=%d PC=%04X A=%02X B=%02X PSW=%02X SP=%02X DPTR=%04X IE=%02X IP=%02X\n",0,totalcycles,pc,a,b,psw,sp,dptr,ie,ip
go 0122
quit
