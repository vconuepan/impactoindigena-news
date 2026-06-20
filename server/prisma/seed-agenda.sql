-- Seed inicial de "Incidencia Internacional Indígena".
-- Items reales tomados del boletín Docip Nº 501 (19 jun 2026) para poblar la
-- página /incidencia-internacional desde el día 1. Idempotente (ON CONFLICT).
-- Ejecutar en pgAdmin DESPUÉS de aplicar la migración add_agenda_item.

INSERT INTO "agenda_items"
  ("id","type","status","title","summary","due_date","start_date","end_date","all_day","location","source_name","source_url","lang","doc_ref","countries","tags","highlight_new","extended_deadline","external_id","published_at","updated_at")
VALUES
  -- EVENTOS / SESIONES
  (gen_random_uuid(),'evento','published',
   '62º período de sesiones del Consejo de Derechos Humanos',
   'Único período de sesiones del Consejo de DDHH; incluye temas de pueblos indígenas en su agenda.',
   NULL,'2026-06-15','2026-07-07',true,'Palais des Nations, Ginebra, Suiza',
   'ACNUDH · Consejo de Derechos Humanos','https://www.ohchr.org/es/hrc-subsidiaries/expert-mechanism-on-indigenous-peoples',
   'es',NULL,'{}','{derechos,onu}',false,false,'seed-docip501-hrc62',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'evento','published',
   '19º período de sesiones del Mecanismo de Expertos sobre los Derechos de los Pueblos Indígenas (MEDPI)',
   'Sesión anual del EMRIP. El equipo de Docip apoya a las delegaciones indígenas en Ginebra.',
   NULL,'2026-07-13','2026-07-17',true,'Palais des Nations, Ginebra, Suiza',
   'EMRIP · ACNUDH','https://www.ohchr.org/es/hrc-subsidiaries/expert-mechanism-on-indigenous-peoples',
   'es',NULL,'{}','{derechos,onu}',false,false,'seed-docip501-emrip19',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'evento','published',
   'Foro político de alto nivel sobre el desarrollo sostenible 2026',
   'Foro anual de seguimiento de la Agenda 2030 en la sede de la ONU.',
   NULL,'2026-07-07','2026-07-15',true,'Sede de la ONU, Nueva York, EE. UU.',
   'ONU · ECOSOC',NULL,'es',NULL,'{}','{desarrollo,onu}',false,false,'seed-docip501-hlpf2026',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  -- CONVOCATORIAS
  (gen_random_uuid(),'convocatoria','published',
   'Solicitudes al Fondo de Contribuciones Voluntarias de la ONU para los Pueblos Indígenas',
   'Para participar en sesiones de órganos de tratado, el 63º Consejo de DDHH y el 53º período de sesiones del EPU (ago–oct 2026).',
   '2026-06-28',NULL,NULL,false,NULL,
   'Fondo Voluntario ONU para los PI','https://www.ohchr.org/es/about-us/funding-budget/indigenous-peoples-fund',
   'es',NULL,'{}','{participacion,onu}',false,false,'seed-docip501-fondo-vol-28jun',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'convocatoria','published',
   'Consulta pública del GANESAN sobre el proyecto de informe relativo a los sistemas alimentarios y de conocimientos de los Pueblos Indígenas',
   'Aportes al borrador de informe del Grupo de Alto Nivel de Expertos en Seguridad Alimentaria.',
   '2026-06-26',NULL,NULL,false,NULL,
   'GANESAN · CSA',NULL,'es',NULL,'{}','{alimentacion}',false,true,'seed-docip501-ganesan',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'convocatoria','published',
   'Contribuciones de las ONG al informe de las partes interesadas para el EPU 54',
   'Aportes de la sociedad civil para el 54º ciclo del Examen Periódico Universal (ene–feb 2027).',
   '2026-07-17',NULL,NULL,false,NULL,
   'ACNUDH · EPU','https://www.ohchr.org/es/calls-for-input-listing',
   'es',NULL,'{Togo,"República Árabe Siria",Venezuela,Islandia,Zimbabwe,Lituania,Uganda,"Timor Leste","República de Moldova",Haití,"Sudán del Sur",Myanmar,Sudán,Ucrania}','{epu,derechos}',false,false,'seed-docip501-epu54',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'convocatoria','published',
   'Contribuciones para el informe de la ONU sobre las personas defensoras de derechos humanos y del ambiente',
   'Aportes para el informe sobre defensoras y defensores del derecho a un ambiente saludable.',
   '2026-08-21',NULL,NULL,false,NULL,
   'Relatoría Especial · ACNUDH','https://www.ohchr.org/es/calls-for-input-listing',
   'es',NULL,'{}','{derechos,ambiente,defensores}',true,false,'seed-docip501-defensores',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  -- OPORTUNIDADES (becas / fondos)
  (gen_random_uuid(),'oportunidad','published',
   'Convocatoria de subvenciones 2026 del Fondo Ayni de FIMI',
   'Fondo del Foro Internacional de Mujeres Indígenas para iniciativas de mujeres y niñas indígenas.',
   '2026-06-30',NULL,NULL,false,NULL,
   'FIMI · Fondo Ayni',NULL,'es',NULL,'{}','{fondos,mujeres}',false,false,'seed-docip501-ayni',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'oportunidad','published',
   'Programa de becas de la OMPI para los Pueblos Indígenas 2026-2027',
   'Becas de formación en propiedad intelectual, recursos genéticos y conocimientos tradicionales.',
   '2026-07-12',NULL,NULL,false,NULL,
   'OMPI','https://www.wipo.int/es/web/traditional-knowledge',
   'es',NULL,'{}','{becas,propiedad-intelectual}',false,true,'seed-docip501-ompi-becas',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'oportunidad','published',
   'Programa de la OMPI de formación, mentoría y contactos en propiedad intelectual para emprendedoras de Pueblos Indígenas y comunidades locales de países africanos',
   'Programa de mentoría dirigido a mujeres emprendedoras indígenas y de comunidades locales en África.',
   '2026-07-12',NULL,NULL,false,NULL,
   'OMPI','https://www.wipo.int/es/web/traditional-knowledge',
   'es',NULL,'{}','{mentoria,propiedad-intelectual,mujeres}',true,false,'seed-docip501-ompi-africa',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  -- PUBLICACIONES
  (gen_random_uuid(),'publicacion','published',
   'Orientación sobre el derecho de los Pueblos Indígenas al consentimiento libre, previo e informado en el contexto de actividades comerciales',
   'Informe de orientación sobre el consentimiento libre, previo e informado (CLPI) en actividades empresariales.',
   NULL,'2026-06-19',NULL,false,NULL,
   'Relatoría Especial · ACNUDH','https://www.ohchr.org/es/indigenous-peoples/reports',
   'es','A/HRC/62/36/Add.2','{}','{clpi,empresas,derechos}',false,false,'seed-docip501-pub-clpi',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

  (gen_random_uuid(),'publicacion','published',
   'Sabiduría indígena: el vínculo inseparable entre clima y cultura',
   'Estudio sobre los vínculos entre la supervivencia cultural de los Pueblos Indígenas y la supervivencia climática.',
   NULL,'2026-06-19',NULL,false,NULL,
   'Docip',NULL,'es',NULL,'{}','{clima,cultura}',false,false,'seed-docip501-pub-clima',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("external_id") DO NOTHING;
