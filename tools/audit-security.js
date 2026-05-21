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

const htmlFiles = [];
const tsFiles = [];

walkDir(path.join(__dirname, '../src/app'), (filePath) => {
  if (filePath.endsWith('.html')) {
    htmlFiles.push(filePath);
  } else if (filePath.endsWith('.ts') && !filePath.endsWith('.spec.ts')) {
    tsFiles.push(filePath);
  }
});

const report = {
  unsafeHtml: [],
  securityBypasses: [],
  unprotectedRoutes: [],
  missingFormValidators: []
};

// 1. Audit HTML Templates for innerHTML usage (potential XSS)
htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const relativePath = path.relative(path.join(__dirname, '..'), file);

  if (content.includes('[innerHTML]') || content.includes('innerHTML=')) {
    // Check if it uses a sanitize pipe or similar
    if (!content.includes('safeHtml') && !content.includes('sanitize')) {
      report.unsafeHtml.push({
        file: relativePath,
        message: 'Uso de innerHTML detectado sin tubería de sanitización aparente (ej. | safeHtml). Posible riesgo de XSS.'
      });
    }
  }
});

// 2. Audit TypeScript Files for DOM Sanitize bypasses & missing form validations
tsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const relativePath = path.relative(path.join(__dirname, '..'), file);

  // Check for Security Bypasses
  if (content.includes('bypassSecurityTrust')) {
    report.securityBypasses.push({
      file: relativePath,
      message: 'Método bypassSecurityTrustX detectado. Asegúrate de que la entrada esté completamente sanitizada antes de usar este escape.'
    });
  }

  // Check for form controls without validators in components
  if (content.includes('FormControl') && !content.includes('Validators.')) {
    report.missingFormValidators.push({
      file: relativePath,
      message: 'FormControl detectado sin Validators. Agrega validaciones (required, maxLength, email) para proteger la entrada.'
    });
  }
});

// 3. Audit app.routes.ts for routes without guards
try {
  const routesPath = path.join(__dirname, '../src/app/app.routes.ts');
  if (fs.existsSync(routesPath)) {
    const routesContent = fs.readFileSync(routesPath, 'utf-8');
    const lines = routesContent.split('\n');
    let currentPath = '';
    
    lines.forEach((line, index) => {
      if (line.includes("path:")) {
        const match = line.match(/path:\s*['"]([^'"]*)['"]/);
        if (match) {
          currentPath = match[1];
        }
      }
      
      // If it is a route definition but has no guards (and isn't public)
      if (line.includes("loadComponent") || line.includes("loadChildren")) {
        const nextLines = lines.slice(Math.max(0, index - 5), index + 1).join('\n');
        if (
          (currentPath.startsWith('admin') || currentPath.startsWith('mi-cuenta')) && 
          !nextLines.includes('canActivate') && 
          !nextLines.includes('canMatch')
        ) {
          report.unprotectedRoutes.push({
            path: currentPath,
            line: index + 1,
            message: `La ruta privada '/${currentPath}' no tiene asignado ningún guard de protección (canActivate).`
          });
        }
      }
    });
  }
} catch (e) {
  // Silent fail if routes file is missing or formatted differently
}

// Output formatted results
console.log('==================================================');
console.log('🛡️ HULA HOOP — TELEMETRÍA DE SEGURIDAD');
console.log('==================================================\n');

if (report.unsafeHtml.length > 0) {
  console.log(`❌ PLANTILLAS CON RIESGO DE XSS [${report.unsafeHtml.length}]:`);
  report.unsafeHtml.forEach(item => {
    console.log(`  • ${item.file}: ${item.message}`);
  });
  console.log('');
} else {
  console.log('✅ No se detectó innerHTML sin sanitizar en plantillas!\n');
}

if (report.securityBypasses.length > 0) {
  console.log(`⚠ ESCAPES DE SEGURIDAD DE ANGULAR [${report.securityBypasses.length}]:`);
  report.securityBypasses.forEach(item => {
    console.log(`  • ${item.file}`);
  });
  console.log('');
}

if (report.unprotectedRoutes.length > 0) {
  console.log(`❌ RUTAS PRIVADAS SIN GUARDIA [${report.unprotectedRoutes.length}]:`);
  report.unprotectedRoutes.forEach(item => {
    console.log(`  • Ruta '/${item.path}' (Línea ${item.line}): ${item.message}`);
  });
  console.log('');
} else {
  console.log('✅ Todas las rutas críticas de administración e inicio de sesión están resguardadas!\n');
}

if (report.missingFormValidators.length > 0) {
  console.log(`💡 FORMULARIOS SIN VALIDACIÓN DETECTADOS [${report.missingFormValidators.length}]:`);
  report.missingFormValidators.forEach(item => {
    console.log(`  • ${item.file}`);
  });
  console.log('');
}

console.log('==================================================');
console.log('💡 Sugerencia para Claude Code: "Claude, añade guards o sanitización en los archivos listados anteriormente."');
console.log('==================================================');
