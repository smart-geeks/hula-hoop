const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== '.angular' && f !== '.git') {
        walkDir(dirPath, callback);
      }
    } else {
      callback(dirPath);
    }
  });
}

const tsFiles = [];
walkDir(path.join(__dirname, '../src/app'), (filePath) => {
  if (filePath.endsWith('.ts') && !filePath.endsWith('.spec.ts')) {
    tsFiles.push(filePath);
  }
});

const report = {
  missingOnPush: [],
  heavyImports: [],
  rxjsStateSubjects: []
};

tsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const relativePath = path.relative(path.join(__dirname, '..'), file);

  // 1. Verificar si es un componente y si le falta OnPush
  if (content.includes('@Component') && !content.includes('ChangeDetectionStrategy.OnPush')) {
    report.missingOnPush.push({
      file: relativePath,
      message: 'Falta configurar ChangeDetectionStrategy.OnPush para mejorar el rendimiento de renderizado.'
    });
  }

  // 2. Verificar importaciones estáticas de librerías pesadas
  const heavyLibs = ['jspdf', 'xlsx', 'html2canvas'];
  heavyLibs.forEach(lib => {
    if (content.includes(`from '${lib}'`) || content.includes(`from "${lib}"`) || content.includes(`require('${lib}')`)) {
      report.heavyImports.push({
        file: relativePath,
        library: lib,
        message: `Importación estática de '${lib}' detectada. Debe cambiarse a Dynamic Import (import('${lib}')) para optimizar el bundle de carga.`
      });
    }
  });

  // 3. Detectar uso de BehaviorSubject en componentes o servicios locales como manejadores de estado reactivo simple
  if (content.includes('BehaviorSubject') && (content.includes('@Component') || file.includes('services'))) {
    report.rxjsStateSubjects.push({
      file: relativePath,
      message: 'Uso de BehaviorSubject detectado. Evaluar migración a Angular Signals (signal/computed) para simplificar reactividad local.'
    });
  }
});

// Output formatted results
console.log('==================================================');
console.log('🤖 HULA HOOP — TELEMETRÍA DE AUDITORÍA ANGULAR');
console.log('==================================================\n');

if (report.missingOnPush.length > 0) {
  console.log(`❌ COMPONENTES SIN ONPUSH [${report.missingOnPush.length}]:`);
  report.missingOnPush.forEach(item => {
    console.log(`  • ${item.file}`);
  });
  console.log('');
} else {
  console.log('✅ Todos los componentes usan OnPush Change Detection!\n');
}

if (report.heavyImports.length > 0) {
  console.log(`⚠ LIBRERÍAS PESADAS CARGADAS ESTÁTICAMENTE [${report.heavyImports.length}]:`);
  report.heavyImports.forEach(item => {
    console.log(`  • ${item.file} -> usa '${item.library}'`);
  });
  console.log('');
} else {
  console.log('✅ Ningún componente carga librerías pesadas estáticamente!\n');
}

if (report.rxjsStateSubjects.length > 0) {
  console.log(`💡 CANDIDATOS A EMITIR CON SIGNALS (BehaviorSubjects) [${report.rxjsStateSubjects.length}]:`);
  report.rxjsStateSubjects.forEach(item => {
    console.log(`  • ${item.file}`);
  });
  console.log('');
} else {
  console.log('✅ Uso óptimo de Signals/RxJS!\n');
}

console.log('==================================================');
console.log('💡 Sugerencia para Claude Code: "Claude, abre los archivos indicados arriba y aplica las correcciones sugeridas."');
console.log('==================================================');
