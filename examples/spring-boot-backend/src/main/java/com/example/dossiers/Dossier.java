package com.example.dossiers;

/** Un dossier ou un fichier ; {@code parent} est l'identifiant du dossier qui le contient ({@code null} : racine). */
public record Dossier(String id, String name, long size, String parent) {
}
