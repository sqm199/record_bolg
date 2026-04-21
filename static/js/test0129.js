(function (window) {
    $().ready(function(){
	
		window.onload = function(){
		var HH = 0;
		var mm = 0;
		var ss = 0;
		var str = '';
		var timer = setInterval(function(){
		str = "";
		if(++ss==60)
		{
		if(++mm==60)
		{
		HH++;
		mm=0;
		}
		ss=0;
		}

		str+=HH<10?"0"+HH:HH;
		str+=":";
		str+=mm<10?"0"+mm:mm;
		str+=":";
		str+=ss<10?"0"+ss:ss;
		document.getElementById("time").innerHTML = str;
		},1000);
		}; 
		
		window.gettime=function(){
		var t = new Date();
		var t1 = t.toLocaleTimeString();
		return t1;
		}
		
		$("#input1").click(function(){
		this.value=parseInt(this.value)+1;
		})
		$("#p0").click(function(){
		alert("ok");
		})
			
		window.login=function(){
		if(($("#userName").val()=="lx")&&($("#userPassword").val()=="lx"))
			alert("bingo");
		else{
			alert("false");
			}
		}
    })
}(window));