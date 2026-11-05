(function(){
  'use strict';
  var status=document.getElementById('status'),download=document.getElementById('download'),upload=document.getElementById('upload');
  function report(text){status.textContent=text;}
  async function api(method,body){
    var code=document.getElementById('code').value.trim();if(!code) throw new Error('Введите код доступа');
    var response=await fetch('/api/backup',{method:method,credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+code,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    var data=await response.json();if(!response.ok || !data.ok) throw new Error(data.error && data.error.message || 'Сервер не вернул копию');return data;
  }
  async function run(action){download.disabled=true;upload.disabled=true;try{await action();}catch(error){report(error.message || 'Не удалось выполнить действие');}finally{download.disabled=false;upload.disabled=false;}}
  download.addEventListener('click',()=>run(async()=>{
    var data=await api('GET'),backup=window.MyOnlineBackup.parse(data.backup),summary=window.MyOnlineBackup.summary(backup);
    var url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'}));
    var link=document.createElement('a');link.href=url;link.download='my-online-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    report('Запрошено сохранение файла. Проверьте загрузки браузера. Видео: '+summary.videos+', записи прогресса: '+summary.episodes+'.');
  }));
  upload.addEventListener('click',()=>run(async()=>{
    var file=document.getElementById('file').files[0];if(!file) throw new Error('Выберите файл копии');if(file.size>window.MyOnlineBackup.limit) throw new Error('Файл больше 2 МБ');
    var backup=window.MyOnlineBackup.parse(await file.text()),summary=window.MyOnlineBackup.summary(backup);
    if(!window.confirm('Передать вашему серверу историю '+summary.videos+' видео и '+summary.episodes+' записей прогресса на пять минут?')) return;
    await api('POST',backup);report('Копия передана на пять минут. На телевизоре выберите «Получить из браузера».');
  }));
})();
